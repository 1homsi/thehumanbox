// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { SPRITE } from '../../shared/sprites'
import { VEGETATION_ATLAS_HEIGHT, VEGETATION_ATLAS_WIDTH, vegetationPlacement } from './vegetation-sprites'

describe('vegetation sprites', () => {
  it('places every tree, shrub and cactus at 1:1 native pixel size within target bounds', () => {
    for (const [name, tile] of Object.entries(SPRITE.trees)) {
      const p = vegetationPlacement(tile, 100, 200, 28)
      expect(p, name).not.toBeNull()
      if (!p) continue
      expect(p.sx).toBeGreaterThanOrEqual(0)
      expect(p.sy).toBeGreaterThanOrEqual(0)
      expect(p.sx + p.sw).toBeLessThanOrEqual(VEGETATION_ATLAS_WIDTH)
      expect(p.sy + p.sh).toBeLessThanOrEqual(VEGETATION_ATLAS_HEIGHT)
      // 1:1 native pixel size regardless of caller box size
      expect(p.width).toBe(p.sw)
      expect(p.height).toBe(p.sh)
      // Feet anchor stays at Math.round(y + size * 0.88)
      expect(p.dy + p.height).toBe(Math.round(200 + 28 * 0.88))

      if (name === 'bush') {
        expect(p.width).toBeGreaterThanOrEqual(5)
        expect(p.width).toBeLessThanOrEqual(7)
        expect(p.height).toBeGreaterThanOrEqual(5)
        expect(p.height).toBeLessThanOrEqual(7)
      } else if (name === 'cactus') {
        expect(p.width).toBeGreaterThanOrEqual(7)
        expect(p.width).toBeLessThanOrEqual(10)
        expect(p.height).toBeGreaterThanOrEqual(7)
        expect(p.height).toBeLessThanOrEqual(10)
      } else {
        expect(p.width).toBeGreaterThanOrEqual(10)
        expect(p.width).toBeLessThanOrEqual(18)
        expect(p.height).toBeGreaterThanOrEqual(10)
        expect(p.height).toBeLessThanOrEqual(18)
      }
    }
  })
})
