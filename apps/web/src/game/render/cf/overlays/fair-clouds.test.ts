import { describe, expect, it, vi } from 'vitest'
import { drawCloudShape } from '../../decorations'
import { FAIR_CLOUD_COUNT, fairCloudAt, fairCloudStrength, paintFairClouds } from './fair-clouds'

// The puff painter lives in decorations.ts, which loads sprite sheets at import time; the test
// only needs to know which clouds were drawn.
vi.mock('../../decorations', () => ({ drawCloudShape: vi.fn() }))

const WORLD = { W: 2000, H: 1400 }
const DAY = { is_day: true, day_progress: 0.3, weather: { kind: 'clear', intensity: 0 } }

describe('fairCloudStrength', () => {
  it('is full through a clear day', () => {
    expect(fairCloudStrength(DAY)).toBe(1)
  })

  it('is zero at night and in any weather but clear', () => {
    expect(fairCloudStrength({ ...DAY, is_day: false })).toBe(0)
    expect(fairCloudStrength({ ...DAY, weather: { kind: 'rain', intensity: 0.4 } })).toBe(0)
    expect(fairCloudStrength({ ...DAY, weather: { kind: 'storm', intensity: 0.9 } })).toBe(0)
  })

  it('fades in after first light and out before dusk', () => {
    const early = fairCloudStrength({ ...DAY, day_progress: 0.05 })
    const late = fairCloudStrength({ ...DAY, day_progress: 0.66 })
    expect(early).toBeGreaterThan(0)
    expect(early).toBeLessThan(1)
    expect(late).toBeGreaterThan(0)
    expect(late).toBeLessThan(1)
  })
})

describe('fairCloudAt', () => {
  it('drifts east over time and stays a sensible size', () => {
    const a = fairCloudAt(1, 0, WORLD.W, WORLD.H)
    const b = fairCloudAt(1, 60_000, WORLD.W, WORLD.H)
    expect(b.x).not.toBe(a.x)
    expect(a.w).toBeGreaterThan(0)
    expect(a.w).toBeLessThan(WORLD.W * 0.2)
    expect(a.h).toBeLessThan(a.w)
  })

  it('places every cloud inside the world band', () => {
    for (let i = 0; i < FAIR_CLOUD_COUNT; i++) {
      const c = fairCloudAt(i, 12_345, WORLD.W, WORLD.H)
      expect(c.y).toBeGreaterThanOrEqual(0)
      expect(c.y).toBeLessThanOrEqual(WORLD.H * 0.6)
    }
  })
})

describe('paintFairClouds', () => {
  const ctx = {} as CanvasRenderingContext2D
  const cloud = vi.mocked(drawCloudShape)

  it('paints nothing when the strength is zero', () => {
    cloud.mockClear()
    paintFairClouds(ctx, WORLD, { x0: 0, y0: 0, x1: WORLD.W, y1: WORLD.H }, 0, 0)
    expect(cloud).not.toHaveBeenCalled()
  })

  it('paints a shadow and a cloud for every cloud in view', () => {
    cloud.mockClear()
    paintFairClouds(ctx, WORLD, { x0: 0, y0: 0, x1: WORLD.W, y1: WORLD.H }, 5000, 1)
    expect(cloud).toHaveBeenCalledTimes(FAIR_CLOUD_COUNT * 2)
    const colours = cloud.mock.calls.map((c) => c[6])
    expect(colours.filter((c) => c === '255,255,255')).toHaveLength(FAIR_CLOUD_COUNT)
  })

  it('skips clouds outside the view', () => {
    cloud.mockClear()
    paintFairClouds(ctx, WORLD, { x0: 0, y0: 0, x1: 1, y1: 1 }, 5000, 1)
    expect(cloud.mock.calls.length).toBeLessThan(FAIR_CLOUD_COUNT * 2)
  })
})
