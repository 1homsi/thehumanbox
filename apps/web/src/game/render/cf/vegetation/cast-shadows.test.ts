import { describe, expect, it } from 'vitest'
import { castSun, SUNSET_PROGRESS } from './cast-shadows'

const day = (dp: number) => castSun({ is_day: true, day_progress: dp })

describe('castSun', () => {
  it('draws no shadows at night', () => {
    expect(castSun({ is_day: false, day_progress: 0.3 })).toBeNull()
  })

  it('draws no shadows in the first and last moments of light', () => {
    expect(day(0)).toBeNull()
    expect(day(SUNSET_PROGRESS)).toBeNull()
  })

  it('is long and faint in the morning and short at noon', () => {
    const morning = day(SUNSET_PROGRESS * 0.12)
    const noon = day(SUNSET_PROGRESS * 0.5)
    expect(morning).not.toBeNull()
    expect(noon).not.toBeNull()
    if (!morning || !noon) return
    expect(morning.length).toBeGreaterThan(noon.length)
    expect(noon.length).toBeCloseTo(0.9, 5)
    expect(noon.alpha).toBeGreaterThan(morning.alpha)
  })

  it('points west in the morning, east in the evening, and a little south', () => {
    const morning = day(SUNSET_PROGRESS * 0.2)
    const evening = day(SUNSET_PROGRESS * 0.8)
    expect(morning?.dx).toBeLessThan(0)
    expect(evening?.dx).toBeGreaterThan(0)
    expect(morning?.dy).toBeGreaterThan(0)
    expect(Math.hypot(morning?.dx ?? 0, morning?.dy ?? 0)).toBeCloseTo(1, 5)
  })

  it('keys change through the day and stay put within a step', () => {
    const a = day(SUNSET_PROGRESS * 0.4)
    const b = day(SUNSET_PROGRESS * 0.4 + 0.0005)
    const c = day(SUNSET_PROGRESS * 0.7)
    expect(a?.key).toBe(b?.key)
    expect(a?.key).not.toBe(c?.key)
  })

  it('never makes a shadow longer than the cap', () => {
    for (let p = 0.02; p < 1; p += 0.01) {
      const s = day(SUNSET_PROGRESS * p)
      if (s) expect(s.length).toBeLessThanOrEqual(3.2 + 1e-9)
    }
  })
})
