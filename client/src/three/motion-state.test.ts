import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { updateOrgMotion, getOrgXY } from './motion-state'
import type { OrganismState } from '../types'

function org(id: string, x: number, y: number, extra: Partial<OrganismState> = {}): OrganismState {
  return {
    id,
    name: id,
    lineage_id: 'lin-' + id,
    x, y,
    vx: 0, vy: 0,
    energy: 1, hydration: 1, health: 1,
    age: 100,
    alive: true,
    thought: '',
    infection: 0, fear_level: 0,
    carrying: 0, carrying_type: 0,
    pregnant: false,
    generation: 1, max_age: 5000,
    traits: { aggression: 0.5, curiosity: 0.5, social_tendency: 0.5, memory_strength: 0.5, resilience: 0.5 },
    ...extra,
  } as unknown as OrganismState
}

describe('motion-state extrapolation', () => {
  let nowMs = 1000
  beforeEach(() => {
    nowMs = 1000
    vi.spyOn(performance, 'now').mockImplementation(() => nowMs)
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('clamps extrapolation past MAX_EXTRAP_MS so positions cannot run away', () => {
    // First snapshot seeds the cache with no velocity (fresh()).
    updateOrgMotion([org('a', 10, 10, { vx: 5, vy: 0 })])
    // Second snapshot 100ms later — ingestSnapshot picks up the
    // vx=5, vy=0 velocity from the wire fields and records it.
    nowMs = 1100
    updateOrgMotion([org('a', 10.5, 10, { vx: 5, vy: 0 })])

    // Read +1000ms past the last snapshot: extrapolation should
    // saturate at MAX_EXTRAP_MS = 150ms worth = 5 t/s × 0.15 = 0.75
    // tiles of slide from serverX=10.5.
    nowMs = 2100
    const [x1000] = getOrgXY('a')
    expect(x1000).toBeLessThanOrEqual(10.5 + 0.81) // ≤ clamp + target-blend slop
    expect(x1000).toBeGreaterThan(10.5)            // we did extrapolate at all
  })

  it('preserves identity across renders with no new snapshot', () => {
    updateOrgMotion([org('b', 0, 0, { vx: 0, vy: 0 })])
    nowMs = 1100
    const [x1, y1] = getOrgXY('b')
    nowMs = 1200
    const [x2, y2] = getOrgXY('b')
    // Zero velocity → no drift.
    expect(x1).toBeCloseTo(0, 5)
    expect(y1).toBeCloseTo(0, 5)
    expect(x2).toBeCloseTo(0, 5)
    expect(y2).toBeCloseTo(0, 5)
  })
})
