import { beforeEach, describe, expect, it } from 'vitest'
import type { WorldState } from '../../types'
import { activeFireworks, resetWorldMoments, updateWorldMoments } from './world-moments'

const world = (era: string) =>
  ({
    lineage_eras: [{ lineage_id: 'a', era_name: era }],
    settlements: [
      { lineage_id: 'a', center: [10, 20], population: 5 },
      { lineage_id: 'a', center: [40, 50], population: 30 },
    ],
  }) as unknown as WorldState

describe('world moments', () => {
  beforeEach(() => resetWorldMoments())

  it('sets off fireworks over the main town when a tribe reaches a new age', () => {
    updateWorldMoments(world('stone'), 0)
    expect(activeFireworks()).toHaveLength(0)
    updateWorldMoments(world('bronze'), 100)
    expect(activeFireworks().map((f) => [f.x, f.y])).toEqual([[40, 50]])
  })

  it('stays quiet on the first sight of a world and when nothing changes', () => {
    updateWorldMoments(world('medieval'), 0)
    updateWorldMoments(world('medieval'), 100)
    expect(activeFireworks()).toHaveLength(0)
  })

  it('lets the fireworks end', () => {
    updateWorldMoments(world('stone'), 0)
    updateWorldMoments(world('bronze'), 100)
    updateWorldMoments(world('bronze'), 10_000)
    expect(activeFireworks()).toHaveLength(0)
  })
})
