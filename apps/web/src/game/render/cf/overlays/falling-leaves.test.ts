import { describe, expect, it } from 'vitest'
import { LEAF_COUNT, leafAt, type LeafView } from './falling-leaves'

const VIEW: LeafView = { x0: 100, y0: 50, x1: 300, y1: 200 }

describe('leafAt', () => {
  it('keeps every leaf inside the view at any time', () => {
    for (let i = 0; i < LEAF_COUNT; i++) {
      for (let t = 0; t < 200_000; t += 9_973) {
        const { x, y } = leafAt(i, t, VIEW)
        expect(x).toBeGreaterThanOrEqual(VIEW.x0)
        expect(x).toBeLessThanOrEqual(VIEW.x1)
        expect(y).toBeGreaterThanOrEqual(VIEW.y0)
        expect(y).toBeLessThanOrEqual(VIEW.y1)
      }
    }
  })

  it('falls over time: a later moment is lower, wrapping back to the top at the bottom', () => {
    const h = VIEW.y1 - VIEW.y0
    const a = leafAt(4, 1000, VIEW)
    const b = leafAt(4, 1100, VIEW)
    const drop = (((b.y - a.y) % h) + h) % h
    expect(drop).toBeGreaterThan(0)
    expect(drop).toBeLessThan(h)
  })

  it('is the same for the same leaf and moment', () => {
    expect(leafAt(9, 5000, VIEW)).toEqual(leafAt(9, 5000, VIEW))
  })

  it('tilts each leaf within a bounded angle', () => {
    for (let i = 0; i < LEAF_COUNT; i++)
      expect(Math.abs(leafAt(i, 1234, VIEW).rot)).toBeLessThanOrEqual(0.9 + 1e-9)
  })
})
