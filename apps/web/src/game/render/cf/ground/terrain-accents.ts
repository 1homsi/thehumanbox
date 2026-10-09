import { SPRITE_UNTEXTURED, type SpriteLayer } from 'xipjs'
import { TILE } from '../../../model/palette'
import { BIOME_ID, TILE_ID } from '../../../model/terrain-ids'
import { landscapeHash } from '../../landscape-style'
import type { CfDriver, CfFrame } from '../frame'
import { packRgba } from '../overlays/color'

/**
 * The marks that give the bare ground its character: dune crests and shade on sand, and lava veins
 * on volcanic ground. Both are flat rectangles placed by a hash of the tile, so they are built once
 * per terrain change (the lava pulses by colour, like the foam does).
 */

export interface AccentRects {
  /** Dune marks: a light crest and a dark shade, as `x, y, w, h` rectangles. */
  crest: number[]
  shade: number[]
  /** Lava veins in four buckets, so the four phases pulse out of step. */
  lava: [number[], number[], number[], number[]]
}

/** A tile is dune ground when it is sand or in the desert biome, and not water, snow or rock. */
export function isDuneTile(tid: number, biome: number): boolean {
  if (tid === TILE_ID.WATER || tid === TILE_ID.FLOODED || tid === TILE_ID.SNOW || tid === TILE_ID.ROCK)
    return false
  return tid === TILE_ID.SAND || biome === BIOME_ID.DESERT
}

/** Volcanic ground: the volcanic biome's rock and ash, not water or snow. */
export function isLavaTile(tid: number, biome: number): boolean {
  if (biome !== BIOME_ID.VOLCANIC) return false
  return tid !== TILE_ID.WATER && tid !== TILE_ID.FLOODED && tid !== TILE_ID.SNOW
}

/**
 * The accent rectangles for the grid. With no biome grid nothing is drawn. Each tile's marks come
 * from a hash of its position, so the pattern is the same every time the grid is built.
 */
export function buildAccentRects(
  tiles: number[][],
  biomes: number[][] | undefined,
  width: number,
  height: number,
): AccentRects {
  const crest: number[] = []
  const shade: number[] = []
  const lava: AccentRects['lava'] = [[], [], [], []]
  if (!biomes) return { crest, shade, lava }
  for (let row = 0; row < height; row++) {
    const tr = tiles[row]
    const br = biomes[row]
    if (!tr || !br) continue
    for (let col = 0; col < width; col++) {
      const tid = tr[col] ?? 0
      const biome = br[col] ?? 0
      const px = col * TILE
      const py = row * TILE
      const h = landscapeHash(col * 3 + 5, row * 7 + 11)
      if (isDuneTile(tid, biome) && h % 5 < 2) {
        // A crest in the lower half of the tile, its shade just under it. A tile is only TILE px wide,
        // so the mark's start and length are small offsets, never a modulus by (TILE - n).
        const x = px + ((h >>> 8) % 3)
        const y = py + TILE * 0.55 + ((h >>> 16) % 2)
        const len = TILE - 4 + ((h >>> 20) % 2)
        crest.push(x, y, len, 2)
        shade.push(x, y + 2, len, 2)
      }
      if (isLavaTile(tid, biome) && h % 7 < 3) {
        const x = px + ((h >>> 9) % (TILE - 2))
        const y = py + ((h >>> 13) % (TILE - 1))
        lava[(h >>> 4) % 4].push(x, y, 2 + ((h >>> 18) % 2), 1.5)
      }
    }
  }
  return { crest, shade, lava }
}

/** Dune marks (static) and lava veins (pulsing), as untextured rectangles, rebuilt on terrain change. */
export class AccentDriver implements CfDriver {
  stats = { rects: 0, rebuilds: 0 }
  private readonly layer: SpriteLayer
  private built = -1
  /** Index where the shade starts (after the crest), and where each lava bucket starts. */
  private starts = [0, 0, 0, 0, 0, 0]
  private lastAlpha = [-1, -1, -1, -1]

  constructor(layer: SpriteLayer) {
    this.layer = layer
  }

  update(f: CfFrame): boolean {
    let changed = false
    if (f.terrainRevision !== this.built && f.terrainRevision !== 0) {
      const { tiles, width, height } = f.world.grid
      const accents = buildAccentRects(tiles, f.biomes, width, height)
      const layer = this.layer
      const lavaCount = accents.lava.reduce((n, b) => n + b.length / 4, 0)
      const total = accents.crest.length / 4 + accents.shade.length / 4 + lavaCount
      layer.resize(total)
      let i = 0
      const put = (rects: readonly number[], color: number) => {
        for (let k = 0; k < rects.length; k += 4, i++) {
          layer.x[i] = rects[k] + rects[k + 2] / 2
          layer.y[i] = rects[k + 1] + rects[k + 3] / 2
          layer.w[i] = rects[k + 2]
          layer.h[i] = rects[k + 3]
          layer.flags[i] = SPRITE_UNTEXTURED
          layer.color[i] = color
          layer.atlas[i] = 0
          layer.frame[i] = 0
          layer.sortKey[i] = 0
          layer.ids[i] = i
          layer.rotation[i] = 0
        }
      }
      put(accents.crest, packRgba(255, 240, 200, 0.5))
      this.starts[1] = i
      put(accents.shade, packRgba(96, 66, 34, 0.38))
      for (let b = 0; b < 4; b++) {
        this.starts[2 + b] = i
        put(accents.lava[b], 0)
      }
      this.starts[0] = 0
      this.lastAlpha = [-1, -1, -1, -1]
      this.built = f.terrainRevision
      this.stats = { rects: total, rebuilds: this.stats.rebuilds + 1 }
      changed = true
    }
    if (this.layer.count === 0) return changed
    // Lava: each bucket pulses on its own phase, in steps so the colour is only rewritten when it moves.
    const t = f.now * 0.0016
    for (let b = 0; b < 4; b++) {
      const pulse = Math.max(0, Math.sin(t + (b * Math.PI) / 2))
      const step = Math.round((0.3 + 0.6 * pulse) * 20) / 20
      if (step === this.lastAlpha[b]) continue
      this.lastAlpha[b] = step
      this.layer.color.fill(
        packRgba(255, 120, 40, step),
        this.starts[2 + b],
        this.starts[2 + b + 1] ?? this.layer.count,
      )
      changed = true
    }
    if (changed) this.layer.touch()
    return changed
  }
}
