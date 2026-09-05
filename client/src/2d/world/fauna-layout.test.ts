import { describe, expect, it } from 'vitest'
import { FAUNA_ATLAS_HEIGHT, FAUNA_ATLAS_WIDTH, FAUNA_RECTS, faunaRect } from './fauna-layout'

describe('animal art atlas', () => {
  it('keeps every crop inside the source image', () => {
    for (const [x, y, width, height] of Object.values(FAUNA_RECTS)) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(width).toBeGreaterThan(0)
      expect(height).toBeGreaterThan(0)
      expect(x + width).toBeLessThanOrEqual(FAUNA_ATLAS_WIDTH)
      expect(y + height).toBeLessThanOrEqual(FAUNA_ATLAS_HEIGHT)
    }
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
