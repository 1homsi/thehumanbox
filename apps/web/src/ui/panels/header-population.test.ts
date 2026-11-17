import { describe, expect, it } from 'vitest'
import type { WorldState } from '../../shared/types'
import { headerPopulation } from './header-population'

const world = { lineage_sizes: [{ id: 'a', count: 1 }] } as unknown as WorldState

describe('headerPopulation', () => {
  it('counts the living people the person list holds, not the tribe sizes from the last deep frame', () => {
    expect(headerPopulation(world, 3)).toBe(3)
    expect(headerPopulation(world, 0)).toBe(0)
  })

  it('falls back to tribe sizes when no person list is given', () => {
    expect(headerPopulation(world, undefined)).toBe(1)
    expect(headerPopulation(null, undefined)).toBe(0)
  })
})
