import { describe, expect, it } from 'vitest'
import { PAD_BOT } from './kit'
import { depthFor, earthy, extrude, shadowRows, snapToPixels } from './finish'
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

/** A width×height sprite with `paint(x, y)` giving each solid pixel's colour, or null for empty. */
function sprite(
  width: number,
  height: number,
  paint: (x: number, y: number) => [number, number, number] | null,
) {
  const d = new Uint8ClampedArray(width * height * 4)
  const front = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const c = paint(x, y)
      if (!c) continue
      const o = (y * width + x) * 4
      d.set([...c, 255], o)
      front[y * width + x] = 1
    }
  }
  return {
    d,
    front,
    rgb: (x: number, y: number) => Array.from(d.slice((y * width + x) * 4, (y * width + x) * 4 + 3)),
  }
}

describe('depth', () => {
  const WALL: [number, number, number] = [200, 180, 140]
  const GLASS: [number, number, number] = [60, 90, 100]

  it('scales with the footprint and never outgrows the room it has', () => {
    expect(depthFor(24, 8)).toBe(5)
    expect(depthFor(16, 8)).toBe(3)
    expect(depthFor(24, 2)).toBe(2)
    expect(depthFor(24, -1)).toBe(0)
  })

  it('gives a box a shaded side going back up and right and a lit top, without touching the front', () => {
    // A 6×6 wall at x 2..7, y 8..13, in a 16×16 sprite.
    const s = sprite(16, 16, (x, y) => (x >= 2 && x <= 7 && y >= 8 ? (y <= 13 ? WALL : null) : null))
    const solid = extrude(s.d, 16, 16, s.front, 3)
    // The front is as it was.
    expect(s.rgb(4, 10)).toEqual(WALL)
    expect(solid[10 * 16 + 4]).toBe(1)
    // The side: right of the front, in shade.
    expect(solid[10 * 16 + 9]).toBe(2)
    const side = s.rgb(9, 10)
    expect(side[0]).toBeLessThan(WALL[0])
    // The top: above the front, lit.
    expect(solid[6 * 16 + 4]).toBe(2)
    expect(s.rgb(4, 6)[0]).toBeGreaterThan(WALL[0])
    // Nothing goes further back than the depth, or below the ground line.
    expect(solid[4 * 16 + 11]).toBe(0)
    for (let x = 0; x < 16; x++) for (let y = 14; y < 16; y++) expect(solid[y * 16 + x]).toBe(0)
  })

  it('keeps a side wall one flat tone when a window sits at the corner', () => {
    // A wall with a column of glass at its right edge on some rows.
    const s = sprite(20, 20, (x, y) => {
      if (x < 2 || x > 11 || y < 6 || y > 17) return null
      return x >= 10 && y >= 9 && y <= 11 ? GLASS : WALL
    })
    extrude(s.d, 20, 20, s.front, 3)
    const tones = new Set<string>()
    for (let y = 7; y <= 15; y++) tones.add(s.rgb(13, y).join())
    expect(tones.size).toBe(1)
  })

  it('takes a thin upright part back only as far as it is wide', () => {
    // A one-pixel pole, 10 high.
    const s = sprite(12, 14, (x, y) => (x === 4 && y >= 2 && y <= 11 ? WALL : null))
    const solid = extrude(s.d, 12, 14, s.front, 4)
    let added = 0
    for (const v of solid) if (v === 2) added++
    // At most one pixel of depth along its length.
    expect(added).toBeLessThanOrEqual(10)
    expect(solid[7 * 14 + 7]).toBe(0)
  })
})
