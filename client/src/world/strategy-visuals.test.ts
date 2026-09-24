import { describe, expect, it } from 'vitest'
import { activeStrategy, strategyBeaconPositions, strategyTimeLabel } from './strategy-visuals'

describe('activeStrategy', () => {
  it('returns visual metadata and remaining time for active guidance', () => {
    expect(activeStrategy({ strategy: 'explore', expires_tick: 1800 }, 600)).toEqual({
      strategy: 'explore',
      symbol: '✦',
      label: 'explore',
      color: '#70c8ff',
      ticksRemaining: 1200,
    })
  })

  it('hides expired and unknown strategies', () => {
    expect(activeStrategy({ strategy: 'trade', expires_tick: 600 }, 600)).toBeNull()
    expect(activeStrategy({ strategy: 'conquer', expires_tick: 1200 }, 600)).toBeNull()
  })
})

describe('strategyBeaconPositions', () => {
  it('uses settlements, then homes, then the living members of an unanchored lineage', () => {
    const positions = strategyBeaconPositions(
      {
        settled: { strategy: 'defend', expires_tick: 100 },
        homed: { strategy: 'trade', expires_tick: 100 },
        wandering: { strategy: 'explore', expires_tick: 100 },
        extinct: { strategy: 'hunt', expires_tick: 100 },
        expired: { strategy: 'settle', expires_tick: 10 },
      },
      10,
      [{ lineage_id: 'settled', center: [20, 30] }],
      { settled: [90, 90, 0], homed: [40, 50, 0] },
      [
        { alive: true, lineage_id: 'settled', x: 1, y: 2 },
        { alive: true, lineage_id: 'homed', x: 3, y: 4 },
        { alive: true, lineage_id: 'wandering', x: 4, y: 6 },
        { alive: true, lineage_id: 'wandering', x: 8, y: 10 },
        { alive: false, lineage_id: 'wandering', x: 100, y: 100 },
        { alive: false, lineage_id: 'extinct', x: 9, y: 9 },
      ],
    )
    expect(positions.map(({ lineageId, x, y }) => [lineageId, x, y])).toEqual([
      ['settled', 20, 30],
      ['homed', 40, 50],
      ['wandering', 6, 8],
    ])
  })
})

describe('strategyTimeLabel', () => {
  it('rounds partial simulation days up and never shows zero', () => {
    expect(strategyTimeLabel(1)).toBe('1d')
    expect(strategyTimeLabel(600)).toBe('1d')
    expect(strategyTimeLabel(601)).toBe('2d')
  })
})
