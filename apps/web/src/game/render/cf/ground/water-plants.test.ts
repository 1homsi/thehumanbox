import { describe, expect, it } from 'vitest'
import { TILE } from '../../../model/palette'
import { TILE_ID } from '../../../model/terrain-ids'
import { buildWaterPlantRects, isOpenWater } from './water-plants'

const W = 40
const H = 40

function grid(fill: number): number[][] {
  return Array.from({ length: H }, () => Array.from({ length: W }, () => fill))
}

/** A lake: water in a square block, grass round it. */
function lake(x0: number, y0: number, size: number): number[][] {
  const g = grid(TILE_ID.GRASS)
  for (let y = y0; y < y0 + size; y++) for (let x = x0; x < x0 + size; x++) g[y]![x] = TILE_ID.WATER
  return g
}

describe('isOpenWater', () => {
  it('is true only for water with water on all four sides', () => {
    const g = lake(10, 10, 5)
    expect(isOpenWater(g, 12, 12)).toBe(true)
    expect(isOpenWater(g, 10, 12)).toBe(false) // the lake's western shore
    expect(isOpenWater(g, 3, 3)).toBe(false) // grass
  })

  it('does not count flooded water as lake water', () => {
    const g = grid(TILE_ID.FLOODED)
    expect(isOpenWater(g, 5, 5)).toBe(false)
  })
})

describe('buildWaterPlantRects', () => {
  it('puts pads only on open water, never on the shore or the land', () => {
    const g = lake(10, 10, 6)
    const out = buildWaterPlantRects(g, W, H, 0, 0)
    expect(out.body.length).toBeGreaterThan(0)
    for (let i = 0; i < out.body.length; i += 4) {
      const col = Math.floor(out.body[i]! / TILE)
      const row = Math.floor(out.body[i + 1]! / TILE)
      expect(isOpenWater(g, col, row)).toBe(true)
    }
  })

  it('draws nothing on land or on a lake too small to have open water', () => {
    const none = buildWaterPlantRects(grid(TILE_ID.GRASS), W, H, 0, 0)
    expect(none.body).toHaveLength(0)
    const tiny = buildWaterPlantRects(lake(4, 4, 2), W, H, 0, 0)
    expect(tiny.body).toHaveLength(0)
  })

  it('is the same for the same grid, and keeps every pad inside its own tile', () => {
    const g = lake(2, 2, 30)
    const a = buildWaterPlantRects(g, W, H, 0, 0)
    const b = buildWaterPlantRects(g, W, H, 0, 0)
    expect(a).toEqual(b)
    for (const rects of [a.rim, a.body, a.shade, a.bloom]) {
      for (let i = 0; i < rects.length; i += 4) {
        const x = rects[i]!
        const y = rects[i + 1]!
        const w = rects[i + 2]!
        const h = rects[i + 3]!
        // Each mark's start is in the tile it is drawn for, and it ends inside that tile or one row up
        // (the bloom sits above its pad).
        const col = Math.floor(x / TILE)
        expect(x).toBeGreaterThanOrEqual(col * TILE)
        expect(x + w).toBeLessThanOrEqual((col + 1) * TILE)
        expect(w).toBeGreaterThan(0)
        expect(h).toBeGreaterThan(0)
        expect(Number.isInteger(x) && Number.isInteger(y)).toBe(true)
      }
    }
  })

  it('floats a pad on roughly one open water cell in six', () => {
    const g = lake(1, 1, 38)
    const out = buildWaterPlantRects(g, W, H, 0, 0)
    const pads = out.body.length / 4
    const open = 36 * 36
    expect(pads / open).toBeGreaterThan(0.1)
    expect(pads / open).toBeLessThan(0.25)
  })

  it('puts a bloom on some pads only, above the pad', () => {
    const out = buildWaterPlantRects(lake(1, 1, 38), W, H, 0, 0)
    expect(out.bloom.length).toBeGreaterThan(0)
    expect(out.bloom.length).toBeLessThan(out.body.length)
    for (let i = 0; i < out.bloom.length; i += 4) expect(out.bloom[i + 3]).toBe(2)
  })
})
