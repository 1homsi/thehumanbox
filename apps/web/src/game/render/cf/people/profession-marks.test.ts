import { describe, expect, it } from 'vitest'
import { professionPixels } from './profession-marks'

describe('professionPixels', () => {
  it('draws nothing for a person with no trade', () => {
    expect(professionPixels(undefined, 4)).toEqual([])
    expect(professionPixels('', 4)).toEqual([])
  })

  it('draws nothing for a trade with no mark', () => {
    expect(professionPixels('actor', 4)).toEqual([])
  })

  it('gives a farmer a straw hat on the head and nothing at the side', () => {
    const marks = professionPixels('farmer', 4)
    expect(marks.length).toBeGreaterThan(0)
    // Worn marks sit on the head: at or above the top of the head (y <= 1) and within the head's width.
    for (const m of marks) {
      expect(m.y).toBeLessThanOrEqual(1)
      expect(m.x).toBeGreaterThanOrEqual(-5)
      expect(m.x + m.w).toBeLessThanOrEqual(5)
    }
  })

  it('holds a smith`s hammer at the side of the body, offset by the hand position', () => {
    const near = professionPixels('smith', 4)
    const far = professionPixels('smith', 6)
    const handNear = near.filter((m) => m.x >= 3)
    const handFar = far.filter((m) => m.x >= 5)
    expect(handNear.length).toBeGreaterThan(0)
    expect(handFar.length).toBe(handNear.length)
  })

  it('gives every mark a colour in #rrggbb form', () => {
    for (const trade of ['farmer', 'smith', 'soldier', 'priest', 'miner', 'hunter']) {
      for (const m of professionPixels(trade, 4)) {
        expect(m.color).toMatch(/^#[0-9a-f]{6}$/)
      }
    }
  })
})
