import { describe, expect, it } from 'vitest'
import { animalGrazing, animalGrowth, isGrazer, YOUNG_ANIMAL_SCALE } from './animal-visuals'

describe('animal growth', () => {
  it('draws a grown animal at full size and a newborn smaller, never empty', () => {
    expect(animalGrowth(undefined)).toBe(1)
    expect(animalGrowth(false)).toBe(1)
    expect(animalGrowth(true)).toBe(YOUNG_ANIMAL_SCALE)
    expect(YOUNG_ANIMAL_SCALE).toBeGreaterThan(0.5)
    expect(YOUNG_ANIMAL_SCALE).toBeLessThan(0.8)
  })
})

describe('grazing', () => {
  it('only sheep and cows graze', () => {
    expect(isGrazer('sheep')).toBe(true)
    expect(isGrazer('cow')).toBe(true)
    expect(isGrazer('wolf')).toBe(false)
    expect(isGrazer('deer')).toBe(false)
  })

  it('never grazes while stepping, and alternates head down and standing while idle', () => {
    expect(animalGrazing('sheep', 3, true, 1000)).toBe(false)
    expect(animalGrazing('wolf', 3, false, 1000)).toBe(false)
    const phases = [0, 1000, 2000, 3000, 4000, 5000, 6000, 7000].map((t) => animalGrazing('cow', 3, false, t))
    expect(phases).toContain(true)
    expect(phases).toContain(false)
  })
})
