import { describe, expect, it } from 'vitest'
import type { WorldState } from '../../shared/types'
import type { TribeStatus } from './tribe-status'
import {
  nextStep,
  objectiveOf,
  pressingNeed,
  shortfalls,
  stanceOf,
  tribeReasoning,
  workOf,
} from './tribe-reasoning'

function status(over: Partial<TribeStatus> = {}): TribeStatus {
  return {
    id: 'a',
    name: 'Ash',
    era: null,
    people: 4,
    food: 0.9,
    stores: 0,
    bread: 0,
    livestock: 0,
    water: 0.9,
    health: 0.9,
    sick: 0,
    faith: 0,
    blessed: false,
    despairing: false,
    lostFaith: false,
    prayer: null,
    nextAge: null,
    ...over,
  }
}

function world(over: Partial<WorldState> = {}): WorldState {
  return {
    tick: 1000,
    lineage_names: { a: 'Ash', b: 'Birch', c: 'Cedar' },
    organisms: [],
    settlements: [],
    tribal_relations: [],
    battles: [],
    tribes_in_peril: [],
    territory: { claimed: [], contested: [] },
    lineage_strategies: {},
    tribe_work: {},
    ...over,
  } as unknown as WorldState
}

const member = (lineage: string, fear: number) => ({ alive: true, lineage_id: lineage, fear_level: fear })

describe('shortfalls', () => {
  it('reads food, water and health from the bars the card shows', () => {
    const s = shortfalls(world(), status({ food: 0.2, water: 0.5, health: 1 }))
    expect(s.food).toBeCloseTo(0.8)
    expect(s.water).toBeCloseTo(0.5)
    expect(s.health).toBe(0)
  })

  it('counts shelter short only when people are past the room the buildings hold', () => {
    const roomy = shortfalls(
      world({ settlements: [{ lineage_id: 'a', population: 4, capacity: 6 }] as never }),
      status(),
    )
    expect(roomy.shelter).toBe(0)
    const packed = shortfalls(
      world({ settlements: [{ lineage_id: 'a', population: 10, capacity: 4 }] as never }),
      status(),
    )
    expect(packed.shelter).toBeCloseTo(0.6)
  })

  it('reads safety from war and from fear, and takes the worse', () => {
    const atWar = shortfalls(
      world({ battles: [{ id: 'x', attackers: ['a'], defenders: ['b'], ended: false } as never] }),
      status(),
    )
    expect(atWar.safety).toBeCloseTo(0.8)
    const scared = shortfalls(world({ organisms: [member('a', 0.9), member('a', 0.7)] as never }), status())
    expect(scared.safety).toBeCloseTo(0.8)
    const calm = shortfalls(world({ organisms: [member('a', 0.1)] as never }), status())
    expect(calm.safety).toBeCloseTo(0.1)
  })

  it('reads land from the share of its ground another tribe contests', () => {
    const s = shortfalls(
      world({
        territory: {
          claimed: [
            {
              lid: 'a',
              tiles: [
                [1, 1],
                [1, 2],
                [1, 3],
                [1, 4],
              ],
            },
          ],
          contested: [
            [1, 2],
            [1, 3],
            [9, 9],
          ],
        },
      }),
      status(),
    )
    expect(s.land).toBeCloseTo(0.5)
  })
})

describe('pressingNeed', () => {
  it('names the most short need at or past the pressing line', () => {
    const short = { food: 0.6, water: 0.9, health: 0, shelter: 0.2, safety: 0.1, land: 0 }
    expect(pressingNeed(short)).toEqual({ need: 'water', short: 0.9 })
  })

  it('is nothing while every need is below the line', () => {
    const short = { food: 0.54, water: 0, health: 0, shelter: 0, safety: 0, land: 0 }
    expect(pressingNeed(short)).toBeNull()
  })
})

describe('objectiveOf', () => {
  it('reports a campaign while it runs, and unguided once it has expired or was never set', () => {
    const w = world({
      lineage_strategies: { a: { strategy: 'hunt', expires_tick: 1500, progress: 4, target: 20 } },
    })
    expect(objectiveOf(w, 'a')).toEqual({ kind: 'guided', strategy: 'hunt', progress: 4, target: 20 })
    expect(objectiveOf(world({ tick: 1600, lineage_strategies: w.lineage_strategies }), 'a')).toEqual({
      kind: 'unguided',
    })
    expect(objectiveOf(w, 'b')).toEqual({ kind: 'unguided' })
  })

  it('stops reporting a campaign as soon as it is completed, before its deadline', () => {
    const done = world({
      lineage_strategies: {
        a: {
          strategy: 'hunt',
          expires_tick: 1500,
          progress: 20,
          target: 20,
          status: 'completed',
          completed: true,
        },
      },
    })
    expect(objectiveOf(done, 'a')).toEqual({ kind: 'unguided' })
  })
})

describe('workOf', () => {
  it('lists the trades people are at work on, most people first', () => {
    const w = world({ tribe_work: { a: { fishing: 2, woodcutting: 5, hunting: 0 } } })
    expect(workOf(w, 'a')).toEqual([
      { skill: 'woodcutting', count: 5 },
      { skill: 'fishing', count: 2 },
    ])
    expect(workOf(w, 'b')).toEqual([])
  })
})

describe('stanceOf', () => {
  it('groups the other tribes by how they stand with this one, in either order of the pair', () => {
    const w = world({
      tribal_relations: [
        { a: 'a', b: 'b', attitude: 0.6, status: 'ally' },
        { a: 'c', b: 'a', attitude: -0.7, status: 'rivals' },
        { a: 'a', b: 'x', attitude: 0, status: 'neutral' },
        { a: 'b', b: 'c', attitude: 0.9, status: 'ally' },
      ] as never,
    })
    expect(stanceOf(w, 'a')).toEqual({ allied: ['Birch'], neutral: ['x'], rivals: ['Cedar'] })
  })
})

describe('nextStep', () => {
  const learning = {
    era: 'iron',
    known: 1,
    required: 3,
    missing: ['smelting'],
    peopleNeeded: 0,
    worldPeople: 0,
    worldPeopleRequired: 0,
    worldKnown: true,
  }

  it('puts a pressing need before a campaign or learning', () => {
    expect(
      nextStep({ need: 'food' }, { kind: 'guided', strategy: 'trade', progress: 0, target: 9 }, learning),
    ).toEqual({
      kind: 'need',
      need: 'food',
    })
  })

  it('then follows the campaign it was guided to', () => {
    expect(nextStep(null, { kind: 'guided', strategy: 'trade', progress: 0, target: 9 }, learning)).toEqual({
      kind: 'campaign',
      strategy: 'trade',
    })
  })

  it('then the next secret it lacks, and otherwise carries on', () => {
    expect(nextStep(null, { kind: 'unguided' }, learning)).toEqual({ kind: 'learn', secret: 'smelting' })
    expect(nextStep(null, { kind: 'unguided' }, null)).toEqual({ kind: 'carryOn' })
  })
})

describe('tribeReasoning', () => {
  it('brings the parts together for one tribe', () => {
    const r = tribeReasoning(
      world({
        organisms: [member('a', 0.1)] as never,
        tribal_relations: [{ a: 'a', b: 'b', attitude: 0.6, status: 'ally' }] as never,
      }),
      status({ water: 0.1 }),
    )
    expect(r.pressing).toEqual({ need: 'water', short: 0.9 })
    expect(r.objective).toEqual({ kind: 'unguided' })
    expect(r.stance.allied).toEqual(['Birch'])
    expect(r.next).toEqual({ kind: 'need', need: 'water' })
  })
})
