import { describe, expect, it } from 'vitest'
import type { NextAge } from './tribe-status'
import { guideLines } from './era-guide'

const next = (over: Partial<NextAge> = {}): NextAge => ({
  era: 'bronze',
  known: 1,
  required: 3,
  missing: ['copper smelting', 'farming'],
  peopleNeeded: 0,
  worldPeople: 40,
  worldPeopleRequired: 60,
  worldKnown: true,
  ...over,
})

describe('guideLines', () => {
  it('lists every missing secret, not just the first few', () => {
    const lines = guideLines(next({ missing: ['a', 'b', 'c', 'd', 'e'] }))
    expect(lines).toEqual([{ kind: 'secrets', names: ['a', 'b', 'c', 'd', 'e'] }])
  })

  it('says how many people the world is short of, in world terms', () => {
    const lines = guideLines(next({ missing: [], peopleNeeded: 20 }))
    expect(lines).toEqual([{ kind: 'people', have: 40, need: 60, short: 20 }])
  })

  it('gives both lines when secrets and people are both short', () => {
    const lines = guideLines(next({ peopleNeeded: 20 }))
    expect(lines.map((l) => l.kind)).toEqual(['secrets', 'people'])
  })

  it('is ready when nothing is missing and the world has the people', () => {
    expect(guideLines(next({ missing: [], peopleNeeded: 0 }))).toEqual([{ kind: 'ready' }])
  })

  it('says nothing about people or readiness while the world totals are unknown', () => {
    expect(guideLines(next({ worldKnown: false, missing: [], peopleNeeded: 0 }))).toEqual([])
    expect(guideLines(next({ worldKnown: false, peopleNeeded: 0 }))).toEqual([
      { kind: 'secrets', names: ['copper smelting', 'farming'] },
    ])
  })
})
