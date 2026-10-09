import { describe, expect, it } from 'vitest'
import { TILE_ID } from '../../../model/terrain-ids'
import { FIREFLY_CELL_TILES, fireflyIn, isFireflyGround, paintFireflies } from './fireflies'

const BOUNDS = { c0: 0, c1: 60, r0: 0, r1: 60 }

function grid(fill: number): number[][] {
  return Array.from({ length: 60 }, () => Array.from({ length: 60 }, () => fill))
}

/** A context that counts the squares it fills. */
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

/** A moment at which some firefly in the block is flashing bright. */
function flashingMoment(): number {
  for (let t = 0; t < 20000; t += 37) {
    for (let r = 0; r < 10; r++)
      for (let c = 0; c < 10; c++) {
        const f = fireflyIn(c, r, t, 0, 0)
        if (f && f.glow > 0.5) return t
      }
  }
  throw new Error('no flash found')
}

describe('fireflyIn', () => {
  it('stays inside its own cell (a little wander aside) and glows between 0 and 1', () => {
    for (let t = 0; t < 30000; t += 211) {
      for (let r = 0; r < 6; r++)
        for (let c = 0; c < 6; c++) {
          const f = fireflyIn(c, r, t, 0, 0)
          if (!f) continue
          expect(f.glow).toBeGreaterThanOrEqual(0)
          expect(f.glow).toBeLessThanOrEqual(1)
          expect(f.x).toBeGreaterThan(c * FIREFLY_CELL_TILES - 2)
          expect(f.x).toBeLessThan((c + 1) * FIREFLY_CELL_TILES + 2)
        }
    }
  })

  it('is the same for the same cell and moment', () => {
    expect(fireflyIn(3, 4, 5000, 0, 0)).toEqual(fireflyIn(3, 4, 5000, 0, 0))
  })

  it('puts a firefly in about one cell in three', () => {
    let n = 0
    for (let r = 0; r < 60; r++) for (let c = 0; c < 60; c++) if (fireflyIn(c, r, 0, 0, 0)) n++
    expect(n / 3600).toBeGreaterThan(0.25)
    expect(n / 3600).toBeLessThan(0.45)
  })

  it('flashes: most of the time dark, sometimes bright', () => {
    let dark = 0
    let bright = 0
    for (let t = 0; t < 4000; t += 13) {
      for (let r = 0; r < 4; r++)
        for (let c = 0; c < 4; c++) {
          const f = fireflyIn(c, r, t, 0, 0)
          if (!f) continue
          if (f.glow < 0.05) dark++
          if (f.glow > 0.5) bright++
        }
    }
    expect(dark).toBeGreaterThan(bright)
    expect(bright).toBeGreaterThan(0)
  })
})

describe('isFireflyGround', () => {
  it('is land, not water or flooded water', () => {
    expect(isFireflyGround(TILE_ID.GRASS)).toBe(true)
    expect(isFireflyGround(TILE_ID.WATER)).toBe(false)
    expect(isFireflyGround(TILE_ID.FLOODED)).toBe(false)
    expect(isFireflyGround(undefined)).toBe(false)
  })
})

describe('paintFireflies', () => {
  it('draws nothing in daylight', () => {
    const { ctx, fills } = countingContext()
    paintFireflies(ctx, BOUNDS, 0, 0, flashingMoment(), 0, grid(TILE_ID.GRASS))
    expect(fills.n).toBe(0)
  })

  it('draws the flashing fireflies over land at night', () => {
    const { ctx, fills } = countingContext()
    paintFireflies(ctx, BOUNDS, 0, 0, flashingMoment(), 1, grid(TILE_ID.GRASS))
    expect(fills.n).toBeGreaterThan(0)
  })

  it('draws none over water', () => {
    const { ctx, fills } = countingContext()
    paintFireflies(ctx, BOUNDS, 0, 0, flashingMoment(), 1, grid(TILE_ID.WATER))
    expect(fills.n).toBe(0)
  })
})
