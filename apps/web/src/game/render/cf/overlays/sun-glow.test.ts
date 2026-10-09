import { describe, expect, it } from 'vitest'
import { paintSun, rayAngle, sunSide, sunStrength } from './sun-glow'

const day = (dp: number) => ({ is_day: true, day_progress: dp })

describe('sunStrength', () => {
  it('is out of sight at night and through the middle of the day', () => {
    expect(sunStrength({ is_day: false, day_progress: 0.9 })).toBe(0)
    expect(sunStrength(day(0.4))).toBe(0)
  })

  it('is up at dawn and comes back at dusk', () => {
    expect(sunStrength(day(0.05))).toBe(1)
    expect(sunStrength(day(0.6))).toBeGreaterThan(0)
    expect(sunStrength(day(0.6))).toBeLessThanOrEqual(1)
  })

  it('stays within 0 and 1 across the whole day', () => {
    for (let i = 0; i <= 100; i++) {
      const s = sunStrength(day(i / 100))
      expect(s).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThanOrEqual(1)
    }
  })
})

describe('sunSide', () => {
  it('rises on the east (left) at dawn and sets on the west (right) at dusk', () => {
    expect(sunSide(0.1)).toBe(-1)
    expect(sunSide(0.6)).toBe(1)
    expect(sunSide(undefined)).toBe(1)
  })
})

describe('rayAngle', () => {
  it('spaces the rays evenly and turns them slowly', () => {
    expect(rayAngle(3, 12, 0)).toBeCloseTo(Math.PI / 2)
    expect(rayAngle(0, 12, 60_000) - rayAngle(0, 12, 0)).toBeCloseTo(3.6, 1)
  })
})

describe('paintSun', () => {
  it('draws nothing when the sun is out of sight', () => {
    let calls = 0
    const ctx = new Proxy(
      {},
      {
        get: () => {
          calls++
          return () => undefined
        },
        set: () => true,
      },
    ) as unknown as CanvasRenderingContext2D
    paintSun(ctx, 0, 0, 10, 0, 0)
    expect(calls).toBe(0)
  })
})
