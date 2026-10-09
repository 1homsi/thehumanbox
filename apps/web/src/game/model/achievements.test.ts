import { describe, expect, it } from 'vitest'
import type { OrganismState } from '../../shared/types'
import { achievementsFor } from './achievements'
import { YEAR_TICKS } from './calendar'

function person(over: Partial<OrganismState> = {}): OrganismState {
  return {
    id: 'p',
    alive: true,
    generation: 0,
    lineage_id: 'L1',
    is_elder: false,
    tools: undefined,
    ...over,
  } as unknown as OrganismState
}

function world(
  over: { tick?: number; organisms?: OrganismState[]; population?: number; tier?: number } = {},
) {
  return {
    tick: over.tick ?? 0,
    organisms: over.organisms ?? [],
    settlements: [
      {
        lineage_id: 'L1',
        tier: over.tier ?? 1,
        population: over.population ?? 0,
      },
    ],
  } as unknown as Parameters<typeof achievementsFor>[0]
}

function unlocked(list: ReturnType<typeof achievementsFor>, id: string) {
  return list.find((a) => a.id === id)?.unlocked
}

/** A world whose grid holds the given road kinds (1 track, 2 bridge). */
function withRoads(roads: number[][]) {
  return { ...(world() as object), grid: { roads } } as unknown as Parameters<typeof achievementsFor>[0]
}

describe('road achievements', () => {
  it('unlocks the first road and the first bridge from the road kinds in the grid', () => {
    const none = achievementsFor(withRoads([[0, 0]]))
    expect(unlocked(none, 'first-road')).toBe(false)
    expect(unlocked(none, 'over-the-water')).toBe(false)
    const some = achievementsFor(withRoads([[0, 1, 0]]))
    expect(unlocked(some, 'first-road')).toBe(true)
    expect(unlocked(some, 'over-the-water')).toBe(false)
    expect(unlocked(achievementsFor(withRoads([[2]])), 'over-the-water')).toBe(true)
  })

  it('shows progress towards a road network until sixty cells are laid', () => {
    const row = Array.from({ length: 30 }, () => 1)
    const short = achievementsFor(withRoads([row])).find((a) => a.id === 'road-network')
    expect(short?.unlocked).toBe(false)
    expect(short?.progress).toBe('30 of 60')
    expect(unlocked(achievementsFor(withRoads([row, row])), 'road-network')).toBe(true)
  })
})

describe('achievements', () => {
  it('starts with everything locked in an empty new world', () => {
    const list = achievementsFor(world())
    expect(list.every((a) => !a.unlocked)).toBe(true)
  })

  it('unlocks a full year once the calendar has turned through one', () => {
    expect(unlocked(achievementsFor(world({ tick: YEAR_TICKS - 1 })), 'full-year')).toBe(false)
    expect(unlocked(achievementsFor(world({ tick: YEAR_TICKS })), 'full-year')).toBe(true)
  })

  it('shows progress towards a hundred souls until it is reached', () => {
    const short = achievementsFor(world({ population: 37 })).find((a) => a.id === 'hundred-souls')
    expect(short?.unlocked).toBe(false)
    expect(short?.progress).toBe('37 of 100')
    expect(unlocked(achievementsFor(world({ population: 100 })), 'hundred-souls')).toBe(true)
  })

  it('unlocks a village when a tribe reaches tier 2 or more', () => {
    expect(unlocked(achievementsFor(world({ tier: 1 })), 'village')).toBe(false)
    expect(unlocked(achievementsFor(world({ tier: 2 })), 'village')).toBe(true)
  })

  it('counts only living people when looking at tribes, generations, rulers and elders', () => {
    const organisms = [
      person({ id: 'a', lineage_id: 'L1', generation: 2, is_leader: true, is_elder: true }),
      person({ id: 'b', lineage_id: 'L2', alive: false, generation: 5 }),
      person({ id: 'c', lineage_id: 'L3', tools: { stone_tools: 1 } }),
    ]
    const list = achievementsFor(world({ organisms }))
    expect(unlocked(list, 'grandchildren')).toBe(true)
    expect(unlocked(list, 'ruler')).toBe(true)
    expect(unlocked(list, 'elder')).toBe(true)
    expect(unlocked(list, 'toolmakers')).toBe(true)
    expect(list.find((a) => a.id === 'three-tribes')?.progress).toBe('2 of 3')
  })

  it('does not count the dead for the grandchildren, ruler or tribe goals', () => {
    const organisms = [person({ alive: false, generation: 4, is_leader: true, lineage_id: 'L9' })]
    const list = achievementsFor(world({ organisms }))
    expect(unlocked(list, 'grandchildren')).toBe(false)
    expect(unlocked(list, 'ruler')).toBe(false)
    expect(list.find((a) => a.id === 'three-tribes')?.progress).toBe('0 of 3')
  })
})
