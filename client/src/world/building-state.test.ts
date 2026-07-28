import { describe, expect, it } from 'vitest'
import type { Building } from '../types'
import {
  buildingContainsWorldTile,
  findBuildingAtWorldTile,
  getBuildingState,
  hasRuinedBuildingAtWorldTile,
} from './building-state'

function building(overrides: Partial<Building> = {}): Building {
  return {
    id: 1,
    kind: 'house',
    x: 4,
    y: 7,
    condition: 1,
    damage: 0,
    integrity: 1,
    ruined: false,
    repairing: false,
    ...overrides,
  }
}

describe('building structural state', () => {
  it('keeps construction progress independent from structural integrity', () => {
    const state = getBuildingState(building({ condition: 0.4, damage: 0.2, integrity: 0.8, repairing: true }))
    expect(state.phase).toBe('construction')
    expect(state.constructionProgress).toBe(0.4)
    expect(state.integrity).toBe(0.8)
    expect(state.isRepairing).toBe(false)
    expect(state.isOperational).toBe(false)
  })

  it('does not make a nearly finished project operational before the simulation does', () => {
    const state = getBuildingState(building({ condition: 0.99 }))
    expect(state.phase).toBe('construction')
    expect(state.isComplete).toBe(false)
    expect(state.isOperational).toBe(false)
  })

  it('distinguishes damage, active repair, ruins, and rebuilding', () => {
    expect(getBuildingState(building({ damage: 0.35, integrity: 0.65 })).phase).toBe('damaged')
    expect(getBuildingState(building({ damage: 0.35, integrity: 0.65, repairing: true })).phase).toBe(
      'repairing',
    )
    expect(getBuildingState(building({ damage: 1, integrity: 0, ruined: true })).phase).toBe('ruined')
    expect(
      getBuildingState(building({ damage: 0.8, integrity: 0.2, ruined: true, repairing: true })).phase,
    ).toBe('rebuilding')
  })

  it('clamps malformed ratios while failing closed for zero integrity', () => {
    const state = getBuildingState(building({ condition: 4, damage: -2, integrity: 0, ruined: false }))
    expect(state.constructionProgress).toBe(1)
    expect(state.damage).toBe(0)
    expect(state.isRuined).toBe(true)
    expect(state.isOperational).toBe(false)
  })

  it('finds buildings across their authoritative footprint', () => {
    const wide = building({ id: 2, fw: 3, fh: 2 })
    expect(buildingContainsWorldTile(wide, 6, 8)).toBe(true)
    expect(buildingContainsWorldTile(wide, 7, 8)).toBe(false)
    expect(findBuildingAtWorldTile([building(), wide], 5, 8)?.id).toBe(2)
    expect(
      hasRuinedBuildingAtWorldTile([wide, building({ id: 3, ruined: true, damage: 1, integrity: 0 })], 4, 7),
    ).toBe(true)
  })
})
