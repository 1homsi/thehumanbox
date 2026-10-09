import { describe, expect, it } from 'vitest'
import type { LeafView } from './falling-leaves'
import { PETAL_COUNT, paintFallingBlossoms, petalAt } from './falling-blossoms'

const VIEW: LeafView = { x0: 100, y0: 50, x1: 300, y1: 200 }

/** A context that only counts the squares it is asked to fill. */
function countingContext() {
  const fills = { n: 0 }
  const ctx = {
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    fillRect() {
      fills.n++
    },
    set fillStyle(_: string) {},
    set globalAlpha(_: number) {},
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, fills }
}

describe('petalAt', () => {
  it('keeps every petal inside the view at any time', () => {
    for (let i = 0; i < PETAL_COUNT; i++) {
      for (let t = 0; t < 200_000; t += 9_973) {
        const { x, y } = petalAt(i, t, VIEW)
        expect(x).toBeGreaterThanOrEqual(VIEW.x0)
        expect(x).toBeLessThanOrEqual(VIEW.x1)
        expect(y).toBeGreaterThanOrEqual(VIEW.y0)
        expect(y).toBeLessThanOrEqual(VIEW.y1)
      }
    }
  })

  it('falls over time, wrapping back to the top at the bottom', () => {
    const h = VIEW.y1 - VIEW.y0
    const a = petalAt(4, 1000, VIEW)
    const b = petalAt(4, 1100, VIEW)
    const drop = (((b.y - a.y) % h) + h) % h
    expect(drop).toBeGreaterThan(0)
    expect(drop).toBeLessThan(h)
  })

  it('is the same for the same petal and moment, and tilts within a bounded angle', () => {
    expect(petalAt(9, 5000, VIEW)).toEqual(petalAt(9, 5000, VIEW))
    for (let i = 0; i < PETAL_COUNT; i++)
      expect(Math.abs(petalAt(i, 1234, VIEW).rot)).toBeLessThanOrEqual(1.2 + 1e-9)
  })
})

describe('paintFallingBlossoms', () => {
  it('draws nothing when there is no spring blossom to show', () => {
    const { ctx, fills } = countingContext()
    paintFallingBlossoms(ctx, VIEW, 1000, 0)
    expect(fills.n).toBe(0)
  })

  it('draws one petal square per petal in spring', () => {
    const { ctx, fills } = countingContext()
    paintFallingBlossoms(ctx, VIEW, 1000, 1)
    expect(fills.n).toBe(PETAL_COUNT)
  })
})
