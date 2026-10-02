import { describe, expect, it } from 'vitest'
import { eraTier } from './building-sprites'

describe('era tiers', () => {
  it('reads the sim’s era names, hyphens included', () => {
    expect(eraTier('pre-stone')).toBe(0)
    expect(eraTier('stone')).toBe(0)
    expect(eraTier('Medieval')).toBe(3)
    expect(eraTier('industrial')).toBe(5)
    expect(eraTier('atomic')).toBe(6)
    expect(eraTier('space')).toBe(7)
    expect(eraTier('kardashev-2')).toBe(8)
    for (const far of ['eldritch', 'voidborn', 'chronal', 'rebirth']) expect(eraTier(far)).toBe(8)
    expect(eraTier(undefined)).toBe(0)
  })
})
