import { describe, expect, it } from 'vitest'
import { TILE_ID } from '../../../model/terrain-ids'
import { RIPPLE_PERIOD_MS, paintWaterRipples, rippleAt } from './water-ripples'

/** A context that counts the rings (ellipses) it is asked to draw. */
function countingContext() {
  const log = { rings: 0 }
  const ctx = {
    save() {},
    restore() {},
    beginPath() {},
    stroke() {},
    ellipse() {
      log.rings++
    },
    globalAlpha: 1,
    strokeStyle: '',
    lineWidth: 1,
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, log }
}

const view = { c0: 0, c1: 20, r0: 0, r1: 20, ox: 0, oy: 0 }
const grid = (tile: number) => Array.from({ length: 20 }, () => Array.from({ length: 20 }, () => tile))

describe('rippleAt', () => {
  it('grows and fades over one period, then starts again', () => {
    const samples = Array.from({ length: 200 }, (_, i) => rippleAt(3, (i * RIPPLE_PERIOD_MS) / 200))
    const young = samples.reduce((a, b) => (b.radius < a.radius ? b : a))
    const old = samples.reduce((a, b) => (b.radius > a.radius ? b : a))
    expect(old.radius).toBeGreaterThan(young.radius)
    expect(old.alpha).toBeLessThan(young.alpha)
    expect(rippleAt(3, RIPPLE_PERIOD_MS).radius).toBeCloseTo(rippleAt(3, 0).radius, 6)
  })
})

describe('paintWaterRipples', () => {
  it('draws rings on water only', () => {
    const land = countingContext()
    paintWaterRipples(land.ctx, grid(TILE_ID.GRASS), view, 1000)
    expect(land.log.rings).toBe(0)

    const sea = countingContext()
    paintWaterRipples(sea.ctx, grid(TILE_ID.WATER), view, 1000)
    expect(sea.log.rings).toBeGreaterThan(0)
  })

  it('keeps its count within the limit however large the water', () => {
    const sea = countingContext()
    const big = { c0: 0, c1: 200, r0: 0, r1: 200, ox: 0, oy: 0 }
    const tiles = Array.from({ length: 200 }, () => Array.from({ length: 200 }, () => TILE_ID.WATER))
    paintWaterRipples(sea.ctx, tiles, big, 1000)
    expect(sea.log.rings).toBeLessThanOrEqual(120)
  })
})
