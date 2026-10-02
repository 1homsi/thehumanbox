import { describe, expect, it } from 'vitest'
import { wardStrength } from './wards'

describe('wards', () => {
  const ward = { x: 10, y: 10, radius: 8, cast: 1000, until: 4000 }
  it('fade as their season runs out', () => {
    expect(wardStrength(ward, 1000)).toBe(1)
    expect(wardStrength(ward, 2500)).toBeCloseTo(0.5)
    expect(wardStrength(ward, 4000)).toBe(0)
    expect(wardStrength(ward, 9000)).toBe(0)
  })
})
