import { SPRITE_UNTEXTURED, type SpriteLayer } from 'xipjs'
import { TILE } from '../../../model/palette'
import { BIOME_ID, TILE_ID } from '../../../model/terrain-ids'
import { landscapeHash } from '../../landscape-style'
import type { CfDriver, CfFrame } from '../frame'
import { packRgba } from '../overlays/color'

/**
 * Cattails at the edge of the wetlands: a clump of two or three stalks, each with a brown seed head,
 * on the grass beside the water. A grass tile in the wetland biome with water on one side takes a
 * clump on about one tile in three. The clump stands in the tile's lower half, so its heads reach
 * up into the tile and never past it. Built once per terrain change, like the other ground marks.
 */

export interface CattailRects {
  /** Stalks (green) and seed heads (dark brown, and a lit edge): `x, y, w, h` rectangles. */
  stalk: number[]
  head: number[]
  headLit: number[]
}

function hasWaterNeighbour(tiles: ReadonlyArray<ReadonlyArray<number>>, col: number, row: number): boolean {
  return (
    tiles[row - 1]?.[col] === TILE_ID.WATER ||
    tiles[row + 1]?.[col] === TILE_ID.WATER ||
    tiles[row]?.[col - 1] === TILE_ID.WATER ||
    tiles[row]?.[col + 1] === TILE_ID.WATER
  )
}

/** Whether a grid cell can hold cattails: wetland grass with water beside it. */
export function isCattailGround(
  tiles: ReadonlyArray<ReadonlyArray<number>>,
  biomes: ReadonlyArray<ReadonlyArray<number>>,
  col: number,
  row: number,
): boolean {
  return (
    tiles[row]?.[col] === TILE_ID.GRASS &&
    biomes[row]?.[col] === BIOME_ID.WETLAND &&
    hasWaterNeighbour(tiles, col, row)
  )
}

/**
 * The cattail rectangles for the grid. Each clump's place, stalk count and heights come from a hash
 * of its world position, so the marsh looks the same every time it is rebuilt.
 */
export function buildCattailRects(
  tiles: ReadonlyArray<ReadonlyArray<number>>,
  biomes: ReadonlyArray<ReadonlyArray<number>> | undefined,
  width: number,
  height: number,
  ox: number,
  oy: number,
): CattailRects {
  const stalk: number[] = []
  const head: number[] = []
  const headLit: number[] = []
  if (!biomes) return { stalk, head, headLit }
  for (let row = 1; row < height - 1; row++) {
    for (let col = 1; col < width - 1; col++) {
      if (!isCattailGround(tiles, biomes, col, row)) continue
      const h = landscapeHash(col + ox + 101, row + oy + 37)
      if (h % 3 !== 0) continue
      // The clump's first stalk sits 1 or 2 px in, so its last head (two px wide) stays inside the tile across.
      const x0 = col * TILE + 1 + ((h >>> 8) % 2)
      const base = row * TILE + TILE - 1
      const stalks = (h >>> 14) % 2 === 0 ? 2 : 3
      for (let k = 0; k < stalks; k++) {
        const sx = x0 + k * 2
        const height4 = 5 + ((h >>> (18 + k)) % 2)
        const top = base - height4
        stalk.push(sx, top, 1, height4)
        // A seed head: two px wide, four tall, on the top of the stalk (it reaches up to 2 px into the tile above).
        head.push(sx, top - 3, 2, 4)
        headLit.push(sx, top - 3, 1, 1)
      }
    }
  }
  return { stalk, head, headLit }
}

const STALK = packRgba(52, 96, 44, 1)
const HEAD = packRgba(98, 60, 34, 1)
const HEAD_LIT = packRgba(150, 100, 56, 1)

/** Cattails as untextured rectangles, rebuilt on terrain change. */
export class CattailDriver implements CfDriver {
  stats = { rects: 0, rebuilds: 0 }
  private readonly layer: SpriteLayer
  private built = -1

  constructor(layer: SpriteLayer) {
    this.layer = layer
  }

  update(f: CfFrame): boolean {
    if (f.terrainRevision === this.built || f.terrainRevision === 0) return false
    const { tiles, width, height } = f.world.grid
    const plants = buildCattailRects(tiles, f.biomes, width, height, f.ox, f.oy)
    const layer = this.layer
    const total = (plants.stalk.length + plants.head.length + plants.headLit.length) / 4
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
    put(plants.stalk, STALK)
    put(plants.head, HEAD)
    put(plants.headLit, HEAD_LIT)
    this.built = f.terrainRevision
    this.stats = { rects: total, rebuilds: this.stats.rebuilds + 1 }
    layer.touch()
    return true
  }
}
