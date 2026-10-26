import { describe, expect, it } from 'vitest'
import type { WorldState } from '../../shared/types'
import { tribeStatus } from './tribe-status'

const person = (lineage_id: string, energy: number, infection = 0) =>
  ({ alive: true, lineage_id, energy, hydration: 0.8, health: 0.9, infection }) as never

describe('tribe status', () => {
  const world = {
    tick: 10,
    organisms: [person('a', 0.2, 0.6), person('a', 0.6), person('b', 1)],
    lineage_names: { a: 'Ashari' },
    lineage_eras: [{ lineage_id: 'a', era_name: 'pre-stone' }],
    faith: { by_lineage: { a: 3 }, answered: 3, forsaken: 0, blessed: ['a'], despairing: [] },
    prayers: [
      { id: 1, lineage_id: 'a', tribe: 'Ashari', kind: 'hunger', x: 1, y: 1, created: 0, expires: 9 },
    ],
    lineage_era_progress: [
      {
        lineage_id: 'a',
        era_name: 'stone',
        next_era: 'bronze',
        pop: 2,
        pop_required: 8,
        pop_ready: false,
        // The age is gated on the whole world's people, which the tribe's own two do not reach.
        world_population: 5,
        world_population_required: 8,
        world_population_ready: false,
        required: ['copper_smelting', 'pottery', 'farming'],
        known: ['pottery'],
        missing: ['copper_smelting', 'farming'],
        discovery_ready: false,
        ready: false,
      },
    ],
  } as unknown as WorldState

  it('counts a member sick from the same infection level the person card and the population count use', () => {
    // 0.2 is past the 0.15 line the simulation and the person card call sick, but short of 0.3.
    const mild = {
      ...world,
      organisms: (world.organisms as unknown as Array<Record<string, unknown>>).map((o) =>
        o.lineage_id === 'a' ? { ...o, infection: 0.2 } : o,
      ),
    } as unknown as WorldState
    expect(tribeStatus(mild, 'a')!.sick).toBe(tribeStatus(mild, 'a')!.people)
  })

  it('averages needs over living members and gathers faith and prayers', () => {
    const s = tribeStatus(world, 'a')!
    expect(s.name).toBe('Ashari')
    expect(s.era).toBe('pre stone')
    expect(s.people).toBe(2)
    expect(s.food).toBeCloseTo(0.4)
    expect(s.sick).toBe(1)
    expect(s.faith).toBe(3)
    expect(s.blessed).toBe(true)
    expect(s.lostFaith).toBe(false)
    expect(s.prayer?.kind).toBe('hunger')
    expect(s.nextAge).toEqual({
      era: 'bronze',
      known: 1,
      required: 3,
      missing: ['copper smelting', 'farming'],
      // 8 people in the world are needed, and 5 are in it: three more, not the tribe's six.
      peopleNeeded: 3,
      worldPeople: 5,
      worldPeopleRequired: 8,
      worldKnown: true,
    })
  })

  it('counts the world short of an age, not the tribe, and needs nothing once the world has the people', () => {
    const ready = {
      ...world,
      lineage_era_progress: [
        {
          ...(world.lineage_era_progress as unknown as Array<Record<string, unknown>>)[0],
          world_population: 9,
          world_population_ready: true,
        },
      ],
    } as unknown as WorldState
    expect(tribeStatus(ready, 'a')!.nextAge?.peopleNeeded).toBe(0)
  })

  it('keeps the secrets for an older frame that has no world totals, and does not claim a world figure', () => {
    const legacy = {
      ...world,
      lineage_era_progress: [
        {
          ...(world.lineage_era_progress as unknown as Array<Record<string, unknown>>)[0],
          world_population: undefined,
          world_population_required: undefined,
          world_population_ready: undefined,
        },
      ],
    } as unknown as WorldState
    const next = tribeStatus(legacy, 'a')!.nextAge
    expect(next?.missing).toEqual(['copper smelting', 'farming'])
    expect(next?.worldKnown).toBe(false)
    expect(next?.peopleNeeded).toBe(0)
  })

  it('is empty for a tribe with nobody left', () => {
    expect(tribeStatus(world, 'gone')).toBeNull()
  })
})
