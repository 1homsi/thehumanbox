import { SPRITE_UNTEXTURED, type SpriteLayer } from 'cubeforge'
import { TILE } from '../../../model/palette'
import { TILE_ID } from '../../../model/terrain-ids'
import { landscapeHash } from '../../landscape-style'
import type { CfDriver, CfFrame } from '../frame'
import { packRgba } from '../overlays/color'

/**
 * Lily pads on the still water of lakes: a pad floats on about one open water cell in six, and
 * one pad in four carries a small pink bloom. A lake is a connected body of water of at most
 * LAKE_MAX_CELLS cells (a bigger body is the sea and gets none). Open water is a lake cell with
 * water on all four sides, so the shore (reeds, foam, ice) keeps its own marks and the pads sit out
 * on the lake. Each pad is a few flat rectangles, built once per terrain change like the other
 * ground marks.
 */

/** Water bodies up to this many cells are lakes; a bigger body is the sea. */
export const LAKE_MAX_CELLS = 1200

/**
 * Marks every water cell that belongs to a lake (a connected body of water of at most
 * LAKE_MAX_CELLS cells). Each body is flood-filled once in full, so the sea is measured whole
 * and costs one pass over the grid.
 */
export function lakeCells(
  tiles: ReadonlyArray<ReadonlyArray<number>>,
  width: number,
  height: number,
): Uint8Array {
  const lake = new Uint8Array(width * height)
  const seen = new Uint8Array(width * height)
  const body: number[] = []
  const stack: number[] = []
  for (let start = 0; start < width * height; start++) {
    const sr = Math.floor(start / width)
    const sc = start - sr * width
    if (seen[start] || tiles[sr]?.[sc] !== TILE_ID.WATER) continue
    body.length = 0
    stack.length = 0
    stack.push(start)
    seen[start] = 1
    while (stack.length > 0) {
      const k = stack.pop()!
      body.push(k)
      const r = Math.floor(k / width)
      const c = k - r * width
      const neighbours = [
        [r - 1, c],
        [r + 1, c],
        [r, c - 1],
        [r, c + 1],
      ] as const
      for (const [nr, nc] of neighbours) {
        if (nr < 0 || nc < 0 || nr >= height || nc >= width) continue
        const n = nr * width + nc
        if (seen[n] || tiles[nr]?.[nc] !== TILE_ID.WATER) continue
        seen[n] = 1
        stack.push(n)
      }
    }
    if (body.length <= LAKE_MAX_CELLS) for (const k of body) lake[k] = 1
  }
  return lake
}

export interface WaterPlantRects {
  /** The pad's light top edge, its body, its shaded underside, and the bloom: `x, y, w, h` rectangles. */
  rim: number[]
  body: number[]
  shade: number[]
  bloom: number[]
}

/** Whether a grid cell is open water: permanent water with water on every side. */
export function isOpenWater(tiles: ReadonlyArray<ReadonlyArray<number>>, col: number, row: number): boolean {
  if (tiles[row]?.[col] !== TILE_ID.WATER) return false
  return (
    tiles[row - 1]?.[col] === TILE_ID.WATER &&
    tiles[row + 1]?.[col] === TILE_ID.WATER &&
    tiles[row]?.[col - 1] === TILE_ID.WATER &&
    tiles[row]?.[col + 1] === TILE_ID.WATER
  )
}

/**
 * The lily pad rectangles for the grid. Each pad's place and bloom come from a hash of its world
 * position, so the lake looks the same every time it is rebuilt, and every mark stays in its tile.
 */
export function buildWaterPlantRects(
  tiles: ReadonlyArray<ReadonlyArray<number>>,
  width: number,
  height: number,
  ox: number,
  oy: number,
): WaterPlantRects {
  const rim: number[] = []
  const body: number[] = []
  const shade: number[] = []
  const bloom: number[] = []
  const lake = lakeCells(tiles, width, height)
  for (let row = 1; row < height - 1; row++) {
    for (let col = 1; col < width - 1; col++) {
      if (!lake[row * width + col] || !isOpenWater(tiles, col, row)) continue
      const h = landscapeHash(col + ox, row + oy)
      if (h % 6 !== 0) continue
      // The pad is 4 px wide and 4 px tall: it may sit 1 to 3 px in from the tile's left and 2 to 4 px down.
      const px = col * TILE + 1 + ((h >>> 8) % 3)
      const py = row * TILE + 2 + ((h >>> 12) % 3)
      rim.push(px + 1, py, 2, 1)
      body.push(px, py + 1, 4, 2)
      shade.push(px + 1, py + 3, 2, 1)
      if ((h >>> 16) % 4 === 0) bloom.push(px + 1, py - 2, 2, 2)
    }
  }
  return { rim, body, shade, bloom }
}

const RIM = packRgba(120, 176, 104, 1)
const BODY = packRgba(63, 127, 69, 1)
const SHADE = packRgba(40, 90, 50, 1)
const BLOOM = packRgba(242, 150, 182, 1)

/** Lily pads as untextured rectangles, rebuilt on terrain change. */
export class WaterPlantDriver implements CfDriver {
  stats = { rects: 0, rebuilds: 0 }
  private readonly layer: SpriteLayer
  private built = -1

  constructor(layer: SpriteLayer) {
    this.layer = layer
  }

  update(f: CfFrame): boolean {
    if (f.terrainRevision === this.built || f.terrainRevision === 0) return false
    const { tiles, width, height } = f.world.grid
    const plants = buildWaterPlantRects(tiles, width, height, f.ox, f.oy)
    const layer = this.layer
    const total = (plants.rim.length + plants.body.length + plants.shade.length + plants.bloom.length) / 4
    layer.resize(total)
    let i = 0
    const put = (rects: readonly number[], color: number) => {
      for (let k = 0; k < rects.length; k += 4, i++) {
        layer.x[i] = rects[k]! + rects[k + 2]! / 2
        layer.y[i] = rects[k + 1]! + rects[k + 3]! / 2
        layer.w[i] = rects[k + 2]!
        layer.h[i] = rects[k + 3]!
        layer.flags[i] = SPRITE_UNTEXTURED
        layer.color[i] = color
        layer.atlas[i] = 0
        layer.frame[i] = 0
        layer.sortKey[i] = 0
        layer.ids[i] = i
        layer.rotation[i] = 0
      }
    }
    put(plants.body, BODY)
    put(plants.shade, SHADE)
    put(plants.rim, RIM)
    put(plants.bloom, BLOOM)
    this.built = f.terrainRevision
    this.stats = { rects: total, rebuilds: this.stats.rebuilds + 1 }
    layer.touch()
    return true
  }
}
