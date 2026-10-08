import { describe, expect, it } from 'vitest'
import type { WorldState } from '../../../../shared/types'
import { hazeLevels } from './haze'

function world(extra: Record<string, unknown>): WorldState {
  return {
    is_day: true,
    day_progress: 0.5,
    weather: { kind: 'clear', intensity: 0 },
    drought: false,
    ...extra,
  } as unknown as WorldState
}

describe('hazeLevels', () => {
  it('is thickest at dawn and gone by mid-morning', () => {
    const dawn = hazeLevels(world({ day_progress: 0.02 })).fog
    const morning = hazeLevels(world({ day_progress: 0.3 })).fog
    expect(dawn).toBeGreaterThan(0.6)
    expect(morning).toBe(0)
  })

  it('lingers a little at dusk and at night', () => {
    expect(hazeLevels(world({ day_progress: 0.95 })).fog).toBeGreaterThan(0)
    expect(hazeLevels(world({ is_day: false, day_progress: 0.5 })).fog).toBeCloseTo(0.35, 5)
  })

  it('thickens after rain and while it is wet', () => {
    expect(hazeLevels(world({ day_progress: 0.5, weather: { kind: 'wet', intensity: 0 } })).fog).toBe(0.5)
    expect(hazeLevels(world({ day_progress: 0.5, weather: { kind: 'rain', intensity: 0.5 } })).fog).toBe(0.25)
  })

  it('shows dust only in drought', () => {
    expect(hazeLevels(world({ drought: false })).dust).toBe(0)
    expect(hazeLevels(world({ drought: true })).dust).toBeGreaterThan(0)
  })

  it('never exceeds 1', () => {
    expect(hazeLevels(world({ day_progress: 0, is_day: false })).fog).toBeLessThanOrEqual(1)
  })
})
