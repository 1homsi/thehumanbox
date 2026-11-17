import { describe, expect, it } from 'vitest'
import { Art, rows } from './art.ts'
import { C, INK, PALETTE_HEX, PALETTE_RGB, ROOF, WALL, hexOf } from './palette.ts'
import { blitRgba } from './to-canvas.ts'

describe('the master palette', () => {
  it('has 46 colours, all different', () => {
    expect(PALETTE_HEX.length).toBe(46)
    expect(new Set(PALETTE_HEX).size).toBe(46)
    expect(PALETTE_RGB.length).toBe(47)
  })

  it('names every index once, from 1 (0 is "no pixel")', () => {
    const indexes = Object.values(C).sort((a, b) => a - b)
    expect(indexes).toEqual(Array.from({ length: 46 }, (_, i) => i + 1))
  })

  it('gives each ramp four tones that get darker', () => {
    const light = (i: number) => PALETTE_RGB[i][0] * 0.3 + PALETTE_RGB[i][1] * 0.59 + PALETTE_RGB[i][2] * 0.11
    for (const ramp of [...Object.values(ROOF), ...Object.values(WALL)]) {
      expect(ramp.length).toBe(4)
      for (let k = 1; k < 4; k++) expect(light(ramp[k])).toBeLessThanOrEqual(light(ramp[k - 1]))
    }
  })

  it('outlines in a warm dark tone, never pure black', () => {
    expect(hexOf(INK)).toBe('#341c27')
  })
})

describe('a sprite', () => {
  it('stamps rows of letters as pixels and skips dots', () => {
    const a = new Art(4, 2).stamp(rows('t', 'a.b', '.a.'), 1, 0, { a: C.red4, b: C.blue3 })
    expect(a.get(1, 0)).toBe(C.red4)
    expect(a.get(2, 0)).toBe(0)
    expect(a.get(3, 0)).toBe(C.blue3)
    expect(a.get(2, 1)).toBe(C.red4)
  })

  it('refuses a stamp with a slipped row or an unknown letter', () => {
    expect(() => rows('bad', 'aaa', 'aa')).toThrow(/row 1/)
    expect(() => new Art(3, 1).stamp(['z'], 0, 0, {})).toThrow(/no colour/)
  })

  it('inks the empty pixels beside the drawing, not the diagonals', () => {
    const a = new Art(5, 5).rect(2, 2, 1, 1, C.red4).outline()
    expect(a.get(2, 1)).toBe(INK)
    expect(a.get(1, 2)).toBe(INK)
    expect(a.get(1, 1)).toBe(0)
    expect(a.get(2, 2)).toBe(C.red4)
  })

  it('trims to what was drawn', () => {
    const a = new Art(10, 10).rect(3, 4, 2, 3, C.green3).trim()
    expect([a.w, a.h]).toEqual([2, 3])
    expect(a.px.every((c) => c === C.green3)).toBe(true)
  })

  it('ignores drawing outside its sheet', () => {
    const a = new Art(2, 2).rect(-5, -5, 20, 20, C.gold4)
    expect(a.px.every((c) => c === C.gold4)).toBe(true)
  })

  it('writes its pixels as opaque palette colours and leaves the rest alone', () => {
    const a = new Art(2, 1).set(1, 0, C.grey9)
    const out = new Uint8ClampedArray(3 * 1 * 4)
    blitRgba(a, out, 3, 1, 1, 0)
    expect([...out]).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 235, 237, 233, 255])
  })
})
