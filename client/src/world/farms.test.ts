import { describe, expect, it } from 'vitest'
import type { FarmInfo } from '../types'
import { farmCropColor, farmProgress, farmStage } from './farms'

const farm = (overrides: Partial<FarmInfo> = {}): FarmInfo => ({
  id: 1,
  x: 4,
  y: 5,
  crop: 'wheat',
  planted_tick: 100,
  ready_tick: 300,
  harvested: false,
  ...overrides,
})

describe('farm visuals', () => {
  it('derives bounded progress and maturity from saved ticks', () => {
    expect(farmProgress(farm(), 50)).toBe(0)
    expect(farmProgress(farm(), 200)).toBe(0.5)
    expect(farmProgress(farm(), 400)).toBe(1)
    expect(farmStage(farm(), 400)).toBe('mature')
  })

  it('treats harvested plots as fallow and honors explicit wire stages', () => {
    expect(farmStage(farm({ harvested: true }), 400)).toBe('fallow')
    expect(farmStage(farm({ stage: 'seeded' }), 150)).toBe('seeded')
    expect(farmProgress(farm({ planted_tick: undefined, ready_tick: undefined, progress: 1.7 }), 200)).toBe(1)
  })

  it('uses distinct crop colors with a stable fallback', () => {
    expect(farmCropColor('wheat')).not.toBe(farmCropColor('rice'))
    expect(farmCropColor('unknown')).toBe('#8caa48')
  })
})
