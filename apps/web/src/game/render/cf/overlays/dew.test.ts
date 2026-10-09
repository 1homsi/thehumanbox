import { describe, expect, it } from 'vitest'
import { TILE_ID } from '../../../model/terrain-ids'
import { DEW_MAX_TILES, dewLevel, hasDew, paintDew } from './dew'

function grid(fill: number): number[][] {
  return Array.from({ length: 40 }, () => Array.from({ length: 40 }, () => fill))
}

/** A context that counts the specks it fills. */
function countingContext() {
  const fills = { n: 0 }
  const ctx = {
    save() {},
    restore() {},
    fillRect() {
      fills.n++
    },
    set fillStyle(_: string) {},
    set globalAlpha(_: number) {},
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, fills }
}

const BOUNDS = { c0: 0, c1: 40, r0: 0, r1: 40 }

describe('dewLevel', () => {
  it('is strongest at first light and gone by the middle of the morning', () => {
    expect(dewLevel({ is_day: true, day_progress: 0 })).toBe(1)
    expect(dewLevel({ is_day: true, day_progress: 0.1 })).toBeCloseTo(0.5)
    expect(dewLevel({ is_day: true, day_progress: 0.2 })).toBe(0)
    expect(dewLevel({ is_day: true, day_progress: 0.5 })).toBe(0)
  })

  it('is never there at night', () => {
    expect(dewLevel({ is_day: false, day_progress: 0.9 })).toBe(0)
    expect(dewLevel({ is_day: false, day_progress: 0 })).toBe(0)
  })
})

describe('hasDew', () => {
  it('is grass only, about one tile in three', () => {
    expect(hasDew(TILE_ID.WATER, 3, 3)).toBe(false)
    expect(hasDew(TILE_ID.SAND, 3, 3)).toBe(false)
    let n = 0
    for (let y = 0; y < 60; y++) for (let x = 0; x < 60; x++) if (hasDew(TILE_ID.GRASS, x, y)) n++
    expect(n / 3600).toBeGreaterThan(0.2)
    expect(n / 3600).toBeLessThan(0.45)
  })
})

describe('paintDew', () => {
  it('draws nothing with no dew, and nothing over a whole-world view', () => {
    const { ctx, fills } = countingContext()
    paintDew(ctx, BOUNDS, 0, 0, 1000, 0, grid(TILE_ID.GRASS))
    expect(fills.n).toBe(0)
    const big = { c0: 0, c1: 300, r0: 0, r1: 300 }
    expect(300 * 300).toBeGreaterThan(DEW_MAX_TILES)
    const counted = countingContext()
    paintDew(counted.ctx, big, 0, 0, 1000, 1, grid(TILE_ID.GRASS))
    expect(counted.fills.n).toBe(0)
  })

  it('puts glints on grass only', () => {
    const grass = countingContext()
    paintDew(grass.ctx, BOUNDS, 0, 0, 1000, 1, grid(TILE_ID.GRASS))
    expect(grass.fills.n).toBeGreaterThan(0)
    const water = countingContext()
    paintDew(water.ctx, BOUNDS, 0, 0, 1000, 1, grid(TILE_ID.WATER))
    expect(water.fills.n).toBe(0)
  })
})
