import { describe, expect, it } from 'vitest'
import { TILE_ID } from '../../../model/terrain-ids'
import { iceCover, isIced, isShore, paintGroundIce } from './ground-ice'

const W = TILE_ID.WATER
const G = TILE_ID.GRASS

// A 5x5 lake in the middle of grass: the lake's border cells are the shore.
const LAKE = Array.from({ length: 7 }, (_, r) =>
  Array.from({ length: 7 }, (_, c) => (r >= 1 && r <= 5 && c >= 1 && c <= 5 ? W : G)),
)

describe('iceCover', () => {
  it('is zero outside winter', () => {
    expect(iceCover('decline', 0.9)).toBe(0)
    expect(iceCover('recovery', 0.9)).toBe(0)
  })

  it('freezes the shore late in an ordinary winter and from the start of a hard one', () => {
    expect(iceCover('scarcity', 0.1)).toBe(0)
    expect(iceCover('scarcity', 0.95)).toBeGreaterThan(0.5)
    expect(iceCover('hard_winter', 0)).toBeGreaterThanOrEqual(0.6)
    expect(iceCover('hard_winter', 0.9)).toBeLessThanOrEqual(1)
  })
})

describe('isShore', () => {
  it('is water with land beside it, and nothing else', () => {
    expect(isShore(LAKE, 1, 1)).toBe(true)
    expect(isShore(LAKE, 3, 3)).toBe(false)
    expect(isShore(LAKE, 0, 0)).toBe(false)
  })
})

describe('isIced', () => {
  it('freezes more cells as the cover grows, and never with no cover', () => {
    let low = 0
    let high = 0
    for (let r = 0; r < 40; r++)
      for (let c = 0; c < 40; c++) {
        if (isIced(r, c, 0.2)) low++
        if (isIced(r, c, 0.9)) high++
      }
    expect(low).toBeLessThan(high)
    expect(isIced(3, 3, 0)).toBe(false)
  })
})

describe('paintGroundIce', () => {
  const view = { c0: 0, c1: 7, r0: 0, r1: 7, ox: 0, oy: 0 }

  it('paints nothing in summer', () => {
    let calls = 0
    const ctx = { save() {}, restore() {}, fillRect: () => calls++ } as unknown as CanvasRenderingContext2D
    paintGroundIce(ctx, LAKE, view, 'decline', 0.5)
    expect(calls).toBe(0)
  })

  it('only paints on the shore, never in the middle of the lake', () => {
    const rects: Array<[number, number]> = []
    const ctx = {
      save() {},
      restore() {},
      fillStyle: '',
      fillRect: (x: number, y: number) => rects.push([x, y]),
    } as unknown as CanvasRenderingContext2D
    paintGroundIce(ctx, LAKE, view, 'hard_winter', 0.5)
    expect(rects.length).toBeGreaterThan(0)
    const inside = rects.filter(([x, y]) => x >= 2 * 8 && x < 5 * 8 && y >= 2 * 8 && y < 5 * 8)
    expect(inside).toHaveLength(0)
  })
})
