import { describe, expect, it } from 'vitest'
import { activeStrategy, strategyTimeLabel } from './strategy-visuals'

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

describe('strategyTimeLabel', () => {
  it('rounds partial simulation days up and never shows zero', () => {
    expect(strategyTimeLabel(1)).toBe('1d')
    expect(strategyTimeLabel(600)).toBe('1d')
    expect(strategyTimeLabel(601)).toBe('2d')
  })
})
