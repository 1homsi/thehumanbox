import { SPRITE_UNTEXTURED, type SpriteLayer } from 'xipjs'
import { TILE } from '../../../model/palette'
import { TILE_ID, isWaterTile } from '../../../model/terrain-ids'
import { tileColor } from '../../base-parts/tile-paint'
import { landscapeHash } from '../../landscape-style'
import { terrainSeason } from '../../terrain-season'
import type { CfDriver, CfFrame } from '../frame'
import { packRgba } from '../overlays/color'

/**
 * Ragged edges between two kinds of ground. The ground is coloured a tile at a time, so where forest
 * meets grass (or savanna meets desert) the border was a staircase of 8-pixel squares, which read as
 * a machine-made grid rather than drawn ground. Along each such edge this lays short runs of the
 * neighbour's colour one or two pixels into the tile, from a hash of the edge, so the two sides
 * interlock in a hand-drawn line. Built once per terrain or season change.
 */

/** How different two tile colours must be (sum over r, g, b) before their edge gets a fringe. */
export const FRINGE_MIN_DIFF = 18

/** Ground that takes a fringe: not water (the shore has its own banks), rock or snow (their own edges). */
function fringed(tid: number): boolean {
  return !isWaterTile(tid) && tid !== TILE_ID.ROCK && tid !== TILE_ID.SNOW && tid !== TILE_ID.VOID
}

/**
 * The fringe as `x, y, w, h, colour` runs. Each edge between two differently coloured tiles is walked
 * pixel by pixel on this tile's side: a depth of 0, 1 or 2 pixels per step, from a hash of the edge, and
 * neighbouring steps of the same depth merged into one run.
 */
export function buildFringe(
  tiles: ArrayLike<number>[],
  biomes: ArrayLike<number>[] | undefined,
  depthMap: ArrayLike<number>[] | undefined,
  season: string | undefined,
  width: number,
  height: number,
): number[] {
  const out: number[] = []
  if (!biomes) return out
  const scratch = new Int32Array(4)
  const colors = new Int32Array(width * height * 3)
  const kinds = new Uint8Array(width * height)
  for (let row = 0; row < height; row++)
    for (let col = 0; col < width; col++) {
      const tid = tileColor(scratch, tiles, biomes, depthMap, season, row, col)
      const i = row * width + col
      kinds[i] = fringed(tiles[row]?.[col] ?? TILE_ID.VOID) && fringed(tid) ? 1 : 0
      colors[i * 3] = scratch[0] + scratch[3]
      colors[i * 3 + 1] = scratch[1] + scratch[3]
      colors[i * 3 + 2] = scratch[2] + scratch[3]
    }
  const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v)
  // The four sides: neighbour offset, and how a step along the edge and a step inward move in pixels.
  const SIDES = [
    { dc: 0, dr: -1, x0: 0, y0: 0, ax: 1, ay: 0, ix: 0, iy: 1 },
    { dc: 0, dr: 1, x0: 0, y0: TILE - 1, ax: 1, ay: 0, ix: 0, iy: -1 },
    { dc: -1, dr: 0, x0: 0, y0: 0, ax: 0, ay: 1, ix: 1, iy: 0 },
    { dc: 1, dr: 0, x0: TILE - 1, y0: 0, ax: 0, ay: 1, ix: -1, iy: 0 },
  ] as const
  for (let row = 0; row < height; row++)
    for (let col = 0; col < width; col++) {
      const i = row * width + col
      if (!kinds[i]) continue
      for (let s = 0; s < 4; s++) {
        const side = SIDES[s]
        const nc = col + side.dc
        const nr = row + side.dr
        if (nc < 0 || nr < 0 || nc >= width || nr >= height) continue
        const n = nr * width + nc
        if (!kinds[n]) continue
        // Only between two biomes: shades inside one (a dry patch in a meadow) keep their straight steps.
        if ((biomes[row]?.[col] ?? 0) === (biomes[nr]?.[nc] ?? 0)) continue
        const diff =
          Math.abs(colors[i * 3] - colors[n * 3]) +
          Math.abs(colors[i * 3 + 1] - colors[n * 3 + 1]) +
          Math.abs(colors[i * 3 + 2] - colors[n * 3 + 2])
        if (diff < FRINGE_MIN_DIFF) continue
        const color = packRgba(clamp(colors[n * 3]), clamp(colors[n * 3 + 1]), clamp(colors[n * 3 + 2]), 1)
        // The same edge hashes the same from both sides' coordinates, but each side keeps its own steps.
        const h = landscapeHash(col * 31 + s * 7 + 3, row * 17 + s * 13 + 5)
        let runStart = 0
        let runDepth = -1
        for (let k = 0; k <= TILE; k++) {
          // Depth 0, 1, 1 or 2 per pixel: mostly one pixel in, with gaps and the odd deeper notch.
          const bits = k < TILE ? (h >>> ((k * 2) % 30)) & 3 : -1
          const depth = bits < 0 ? -1 : bits === 0 ? 0 : bits === 3 ? 2 : 1
          if (depth === runDepth) continue
          if (runDepth > 0) {
            const len = k - runStart
            const px = col * TILE + side.x0 + side.ax * runStart
            const py = row * TILE + side.y0 + side.ay * runStart
            // The run's top-left corner: inward steps go +1 or -1 pixel from the edge row or column.
            const x = side.ix < 0 ? px - (runDepth - 1) : px
            const y = side.iy < 0 ? py - (runDepth - 1) : py
            const w = side.ax ? len : runDepth
            const hh = side.ay ? len : runDepth
            out.push(x, y, w, hh, color)
          }
          runStart = k
          runDepth = depth
        }
      }
    }
  return out
}

/** The fringe as untextured rectangles over the terrain, under everything standing on it. */
export class FringeDriver implements CfDriver {
  stats = { rects: 0, rebuilds: 0 }
  private readonly layer: SpriteLayer
  private builtKey = ''

  constructor(layer: SpriteLayer) {
    this.layer = layer
  }

  update(f: CfFrame): boolean {
    if (f.terrainRevision === 0) return false
    // The terrain's own season (a hard winter repaints the ground), so the runs match the tiles they sit on.
    const season = terrainSeason(f.world)
    const key = `${f.terrainRevision}|${season}`
    if (key === this.builtKey) return false
    this.builtKey = key
    const { tiles, width, height } = f.world.grid
    // No depth map: it only colours water, and water takes no fringe.
    const runs = buildFringe(tiles, f.biomes, undefined, season, width, height)
    const layer = this.layer
    const n = runs.length / 5
    layer.resize(n)
    for (let k = 0, i = 0; i < n; i++, k += 5) {
      layer.x[i] = runs[k] + runs[k + 2] / 2
      layer.y[i] = runs[k + 1] + runs[k + 3] / 2
      layer.w[i] = runs[k + 2]
      layer.h[i] = runs[k + 3]
      layer.flags[i] = SPRITE_UNTEXTURED
      layer.color[i] = runs[k + 4]
      layer.atlas[i] = 0
      layer.frame[i] = 0
      layer.sortKey[i] = 0
      layer.ids[i] = i
      layer.rotation[i] = 0
    }
    layer.touch()
    this.stats = { rects: n, rebuilds: this.stats.rebuilds + 1 }
    return true
  }
}
