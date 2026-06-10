import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { updateOrgMotion, getOrgXY } from './motion-state'
import type { OrganismState } from '../../../types'

let nextId = 0

function org(id: string, x: number, y: number, extra: Partial<OrganismState> = {}): OrganismState {
  return {
    id,
    name: id,
    lineage_id: 'lin-' + id,
    x,
    y,
    vx: 0,
    vy: 0,
    energy: 1,
    hydration: 1,
    health: 1,
    age: 100,
    alive: true,
    thought: '',
    infection: 0,
    fear_level: 0,
    carrying: 0,
    carrying_type: 0,
    pregnant: false,
    generation: 1,
    max_age: 5000,
    traits: { aggression: 0.5, curiosity: 0.5, social_tendency: 0.5, memory_strength: 0.5, resilience: 0.5 },
    ...extra,
  } as unknown as OrganismState
}

describe('motion-state interpolation', () => {
  let nowMs = 1000
  let id = ''
  beforeEach(() => {
    nowMs = 1000
    id = 'org-' + nextId++
    vi.spyOn(performance, 'now').mockImplementation(() => nowMs)
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('glides between snapshots instead of teleporting', () => {
    updateOrgMotion([org(id, 10, 10)])
    nowMs = 1500
    updateOrgMotion([org(id, 12, 10)])

    nowMs = 1600
    const [xa] = getOrgXY(id)
    nowMs = 1750
    const [xb] = getOrgXY(id)
    nowMs = 1900
    const [xc] = getOrgXY(id)

    expect(xa).toBeGreaterThan(10)
    expect(xa).toBeLessThan(12)
    expect(xb).toBeGreaterThan(xa)
    expect(xc).toBeGreaterThan(xb)
    expect(xc).toBeLessThanOrEqual(12.01)
  })

  it('stays continuous across a snapshot arrival', () => {
    updateOrgMotion([org(id, 10, 10)])
    nowMs = 1500
    updateOrgMotion([org(id, 11, 10)])
    nowMs = 1990
    const [before] = getOrgXY(id)
    nowMs = 2000
    updateOrgMotion([org(id, 13, 10)])
    nowMs = 2016
    const [after] = getOrgXY(id)
    expect(Math.abs(after - before)).toBeLessThan(0.25)
  })

  it('comes to rest after the glide window instead of running away', () => {
    updateOrgMotion([org(id, 10, 10)])
    nowMs = 1500
    updateOrgMotion([org(id, 11, 10)])
    nowMs = 6000
    const [x1] = getOrgXY(id)
    nowMs = 6100
    const [x2] = getOrgXY(id)
    expect(Math.abs(x2 - x1)).toBeLessThan(0.01)
    expect(x1).toBeLessThan(11.6)
  })

  it('snaps on teleport-scale moves rather than gliding across the map', () => {
    updateOrgMotion([org(id, 10, 10)])
    nowMs = 1500
    updateOrgMotion([org(id, 60, 60)])
    nowMs = 1550
    const [x, y] = getOrgXY(id)
    expect(x).toBeCloseTo(60, 1)
    expect(y).toBeCloseTo(60, 1)
  })

  it('holds still with no movement in snapshots', () => {
    updateOrgMotion([org(id, 5, 5)])
    nowMs = 1100
    const [x1, y1] = getOrgXY(id)
    nowMs = 1500
    updateOrgMotion([org(id, 5, 5)])
    nowMs = 1700
    const [x2, y2] = getOrgXY(id)
    expect(x1).toBeCloseTo(5, 5)
    expect(y1).toBeCloseTo(5, 5)
    expect(x2).toBeCloseTo(5, 5)
    expect(y2).toBeCloseTo(5, 5)
  })
})
