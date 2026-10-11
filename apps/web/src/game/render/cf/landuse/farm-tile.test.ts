import { describe, expect, it } from 'vitest'
import { farmCropStyle, farmLookKey, paintFarmTile, ploughPixels, type FarmLook } from './farm-tile'

describe('the plough in a field', () => {
  it('draws an ox or a tractor inside the tile, one pixel in and two down, and no pixel outside it', () => {
    for (const plough of ['ox', 'tractor']) {
      const pixels = ploughPixels(plough)
      expect(pixels.length).toBeGreaterThan(12)
      for (const [x, y] of pixels) {
        expect(x).toBeGreaterThanOrEqual(1)
        expect(x).toBeLessThan(8)
        expect(y).toBeGreaterThanOrEqual(2)
        expect(y).toBeLessThan(8)
      }
    }
    expect(ploughPixels('cart')).toEqual([])
  })

  it('paints the ox into a ploughed growing field, and only then', () => {
    const paintedColours = (look: FarmLook) => {
      const painted: string[] = []
      const ctx = {
        fillStyle: '',
        fillRect: () => painted.push(String(ctx.fillStyle)),
      } as unknown as CanvasRenderingContext2D
      paintFarmTile(ctx, 0, 0, look)
      return painted
    }
    const look: FarmLook = {
      stage: 'growing',
      progress: 0.4,
      cropColor: '#e0c060',
      crop: 'wheat',
      variant: 0,
      season: 'recovery',
      edges: 0,
    }
    expect(paintedColours({ ...look, plough: 'ox' })).toContain('#a06c40')
    expect(paintedColours(look)).not.toContain('#a06c40')
  })

  it('keys a field by its plough, so a ploughed field and a bare one are different sprites', () => {
    const look = {
      stage: 'growing',
      progress: 0.2,
      cropColor: '#c9a',
      crop: 'wheat',
      variant: 0,
      season: 'recovery',
      edges: 0,
    }
    expect(farmLookKey({ ...look, plough: 'ox' })).not.toBe(farmLookKey(look))
    expect(farmLookKey({ ...look, plough: null })).toBe(farmLookKey(look))
  })
})

describe('farmCropStyle', () => {
  it('gives each crop family its own silhouette', () => {
    expect(farmCropStyle('wheat')).toBe('grain')
    expect(farmCropStyle('barley')).toBe('grain')
    expect(farmCropStyle('rice')).toBe('paddy')
    expect(farmCropStyle('maize')).toBe('stalk')
    expect(farmCropStyle('potato')).toBe('mound')
    expect(farmCropStyle('beans')).toBe('vine')
    expect(farmCropStyle('cotton')).toBe('tuft')
    expect(farmCropStyle('tobacco')).toBe('leaf')
    expect(farmCropStyle('sugarcane')).toBe('cane')
    expect(farmCropStyle('coffee')).toBe('shrub')
    expect(farmCropStyle('tea')).toBe('shrub')
  })

  it('is case-insensitive and falls back to grain for unknown or missing crops', () => {
    expect(farmCropStyle('Rice')).toBe('paddy')
    expect(farmCropStyle('quinoa')).toBe('grain')
    expect(farmCropStyle(undefined)).toBe('grain')
  })
})
