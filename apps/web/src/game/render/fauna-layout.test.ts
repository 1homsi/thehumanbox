import { describe, expect, it } from 'vitest'
import { FAUNA_ATLAS_HEIGHT, FAUNA_ATLAS_WIDTH, FAUNA_RECTS, faunaRect } from './fauna-layout'

describe('animal art atlas', () => {
  it('keeps every crop inside the source image and at native pixel-art targets', () => {
    for (const [x, y, width, height] of Object.values(FAUNA_RECTS)) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(width).toBeGreaterThan(0)
      expect(height).toBeGreaterThan(0)
      expect(x + width).toBeLessThanOrEqual(FAUNA_ATLAS_WIDTH)
      expect(y + height).toBeLessThanOrEqual(FAUNA_ATLAS_HEIGHT)
    }
    expect(Math.max(FAUNA_RECTS.rabbit[2], FAUNA_RECTS.rabbit[3])).toBe(6)
    expect(Math.max(FAUNA_RECTS.bird[2], FAUNA_RECTS.bird[3])).toBe(5)
    expect(Math.max(FAUNA_RECTS.goldBird[2], FAUNA_RECTS.goldBird[3])).toBe(5)
    expect(Math.max(FAUNA_RECTS.fish[2], FAUNA_RECTS.fish[3])).toBe(6)
    expect(Math.max(FAUNA_RECTS.dog[2], FAUNA_RECTS.dog[3])).toBe(10)
    expect(Math.max(FAUNA_RECTS.boar[2], FAUNA_RECTS.boar[3])).toBe(10)
    expect(Math.max(FAUNA_RECTS.deer[2], FAUNA_RECTS.deer[3])).toBe(12)
    expect(Math.max(FAUNA_RECTS.wolf[2], FAUNA_RECTS.wolf[3])).toBe(12)
  })
  it('keeps species distinct and bird variants stable', () => {
    for (const kind of ['rabbit', 'deer', 'boar', 'wolf', 'dog', 'fish']) {
      expect(faunaRect(kind, 1)).toEqual(faunaRect(kind, 100))
      expect(faunaRect(kind, 1)).not.toBeNull()
    }
    expect(faunaRect('bird', 2)).toEqual(FAUNA_RECTS.bird)
    expect(faunaRect('bird', 3)).toEqual(FAUNA_RECTS.goldBird)
    expect(faunaRect('unknown', 1)).toBeNull()
  })
})
