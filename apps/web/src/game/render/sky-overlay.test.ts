import { describe, expect, it } from 'vitest'
import { skyOverlayStrength, useSkyOverlay } from './sky-overlay'

describe('sky overlay strength', () => {
  it('fades in, holds, fades out and is gone once its time is up', () => {
    const duration = 14000
    expect(skyOverlayStrength(-1, duration)).toBe(0)
    expect(skyOverlayStrength(750, duration)).toBeCloseTo(0.5)
    expect(skyOverlayStrength(7000, duration)).toBe(1)
    expect(skyOverlayStrength(12500, duration)).toBeCloseTo(0.5)
    expect(skyOverlayStrength(duration, duration)).toBe(0)
  })
})

describe('sky overlay store', () => {
  it('starts an effect and clears it again', () => {
    useSkyOverlay.getState().start('eclipse', 1000)
    expect(useSkyOverlay.getState()).toMatchObject({ kind: 'eclipse', startedAt: 1000 })
    useSkyOverlay.getState().clear()
    expect(useSkyOverlay.getState().kind).toBeNull()
  })
})
