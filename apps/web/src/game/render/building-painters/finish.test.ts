import { describe, expect, it } from 'vitest'
import { PAD_BOT } from './kit'
import { earthy, shadowRows, snapToPixels } from './finish'
import { sideWidth } from './kit'

describe('earthy colours', () => {
  it('leaves greys alone apart from a little warmth', () => {
    const [r, g, b] = earthy(120, 120, 120)
    expect(r).toBeGreaterThanOrEqual(g)
    expect(g).toBeGreaterThanOrEqual(b)
    expect(r - b).toBeLessThan(12)
  })

  it('reins in neon saturation but keeps the hue', () => {
    const [r, , b] = earthy(30, 60, 220)
    expect(b).toBeGreaterThan(r)
    expect(b - r).toBeLessThan(220 - 30)
  })

  it('keeps colours inside 0..255', () => {
    for (const c of [0, 255]) {
      for (const rgb of [earthy(c, 0, 255), earthy(255, c, 0)]) {
        for (const v of rgb) {
          expect(v).toBeGreaterThanOrEqual(0)
          expect(v).toBeLessThanOrEqual(255)
        }
      }
    }
  })
})

describe('cast shadow', () => {
  it('falls below and to the right of the base and stays in the cell padding', () => {
    const rows = shadowRows(10, 30, 50, 24, 8)
    expect(rows.length).toBeGreaterThan(2)
    // It starts under the building's bottom edge and reaches at most PAD_BOT rows below the ground line.
    expect(Math.max(...rows.map((r) => r.y))).toBeLessThanOrEqual(50 + PAD_BOT - 1)
    expect(Math.max(...rows.map((r) => r.x1))).toBeGreaterThan(31)
    expect(Math.max(...rows.map((r) => r.x1))).toBeLessThanOrEqual(31 + 8)
    // Each row reaches further right than the one above: the shadow leans away from the light.
    for (let i = 1; i < rows.length; i++) expect(rows[i].x1).toBeGreaterThanOrEqual(rows[i - 1].x1)
  })

  it('is longer for taller buildings and never longer than the room it has', () => {
    const reach = (h: number, room: number) =>
      Math.max(...shadowRows(0, 10, 40, h, room).map((r) => r.x1)) - 11
    expect(reach(40, 8)).toBeGreaterThan(reach(10, 8))
    expect(reach(40, 3)).toBeLessThanOrEqual(3)
  })
})

describe('side wall', () => {
  it('is absent on slivers and grows with the wall', () => {
    expect(sideWidth(5)).toBe(0)
    expect(sideWidth(10)).toBe(2)
    expect(sideWidth(20)).toBe(3)
    expect(sideWidth(40)).toBe(4)
  })
})

describe('whole pixels', () => {
  it('drops faint edge pixels and makes the rest fully solid, leaving whole ones alone', () => {
    // Four pixels: empty, faint fringe, mostly covered, solid.
    const d = new Uint8ClampedArray([0, 0, 0, 0, 200, 100, 50, 40, 200, 100, 50, 160, 10, 20, 30, 255])
    snapToPixels(d)
    expect(Array.from(d.slice(0, 4))).toEqual([0, 0, 0, 0])
    expect(Array.from(d.slice(4, 8))).toEqual([0, 0, 0, 0])
    expect(Array.from(d.slice(8, 12))).toEqual([200, 100, 50, 255])
    expect(Array.from(d.slice(12, 16))).toEqual([10, 20, 30, 255])
  })
})
