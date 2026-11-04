import { describe, expect, it } from 'vitest'
import { TILE } from '../../../model/palette'
import { TILE_ID } from '../../../model/terrain-ids'
import { EMBER_FIRE_MIN, EMBER_LIFE_MS, emberAt, paintCampfireSparks, paintEmbers } from './embers'

/** A context that counts the squares it is asked to fill. */
function countingContext() {
  const log = { fills: 0 }
  const ctx = {
    save() {},
    restore() {},
    globalAlpha: 1,
    fillStyle: '',
    fillRect() {
      log.fills++
    },
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, log }
}

describe('emberAt', () => {
  it('is the same at the same moment, and moves on as the clock runs', () => {
    expect(emberAt(5, 1, 1000, 40, 40)).toEqual(emberAt(5, 1, 1000, 40, 40))
    expect(emberAt(5, 1, 1000, 40, 40)).not.toEqual(emberAt(5, 1, 1200, 40, 40))
  })

  it('climbs over its life: the oldest sample is higher than the newest', () => {
    const samples = Array.from({ length: 200 }, (_, i) => emberAt(9, 0, (i * EMBER_LIFE_MS) / 200, 0, 100))
    const young = samples.reduce((a, b) => (b.age < a.age ? b : a))
    const old = samples.reduce((a, b) => (b.age > a.age ? b : a))
    expect(old.age).toBeGreaterThan(0.9)
    expect(young.age).toBeLessThan(0.1)
    expect(old.y).toBeLessThan(young.y)
  })

  it('repeats every life', () => {
    expect(emberAt(9, 0, EMBER_LIFE_MS, 0, 100).age).toBeCloseTo(emberAt(9, 0, 0, 0, 100).age, 6)
  })

  it('stays near its cell (a small sway and drift, no wild flight)', () => {
    for (let t = 0; t < EMBER_LIFE_MS * 3; t += 97) {
      const p = emberAt(42, 2, t, 100, 200)
      expect(Math.abs(p.x - 100)).toBeLessThan(TILE)
      expect(p.y).toBeLessThanOrEqual(200)
      expect(p.y).toBeGreaterThan(200 - TILE * 3)
    }
  })
})

describe('paintEmbers', () => {
  const view = { c0: 0, c1: 3, r0: 0, r1: 2, ox: 0, oy: 0 }
  // Row 0: one burning cell (col 1), one cold one. Row 1: all cold.
  const fire = [
    [0, 0.9, 0.1],
    [0, 0, 0],
  ]

  it('throws embers from burning cells only', () => {
    const { ctx, log } = countingContext()
    paintEmbers(ctx, fire, view, 500)
    expect(log.fills).toBe(3)
  })

  it('paints nothing with no fire grid or nothing burning', () => {
    const { ctx, log } = countingContext()
    paintEmbers(ctx, undefined, view, 500)
    paintEmbers(ctx, [[0, EMBER_FIRE_MIN - 0.01]], { ...view, r1: 1 }, 500)
    expect(log.fills).toBe(0)
  })

  it('throws two embers over each campfire tile and none over other ground', () => {
    const tiles = [
      [TILE_ID.GRASS, TILE_ID.CAMPFIRE, TILE_ID.GRASS],
      [TILE_ID.GRASS, TILE_ID.GRASS, TILE_ID.GRASS],
    ]
    const { ctx, log } = countingContext()
    paintCampfireSparks(ctx, tiles, view, 500)
    expect(log.fills).toBe(2)
    const none = countingContext()
    paintCampfireSparks(none.ctx, [[TILE_ID.GRASS]], { ...view, r1: 1 }, 500)
    expect(none.log.fills).toBe(0)
  })

  it('paints the same embers from the list of burning cells as from a scan of the grid', () => {
    const big = Array.from({ length: 30 }, (_, r) =>
      Array.from({ length: 30 }, (_, c) => ((r * 7 + c * 3) % 11 === 0 ? 0.8 : 0)),
    )
    const hot: number[] = []
    big.forEach((row, r) => row.forEach((v, c) => v > 0 && hot.push(r, c)))
    const record = () => {
      const rects: string[] = []
      const ctx = {
        save() {},
        restore() {},
        globalAlpha: 1,
        fillStyle: '',
        fillRect(x: number, y: number) {
          rects.push(`${x},${y},${ctx.fillStyle},${ctx.globalAlpha.toFixed(3)}`)
        },
      }
      return { ctx: ctx as unknown as CanvasRenderingContext2D, rects }
    }
    const v = { c0: 3, c1: 28, r0: 2, r1: 25, ox: 0, oy: 0 }
    const scanned = record()
    paintEmbers(scanned.ctx, big, v, 777)
    const listed = record()
    paintEmbers(listed.ctx, big, v, 777, Int32Array.from(hot))
    expect(listed.rects.length).toBeGreaterThan(0)
    expect(listed.rects).toEqual(scanned.rects)
  })

  it('reads the grid at the offset of the origin', () => {
    const { ctx, log } = countingContext()
    paintEmbers(ctx, fire, { ...view, c0: 10, c1: 13, ox: 10 }, 500)
    expect(log.fills).toBe(3)
  })
})
