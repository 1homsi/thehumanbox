import { describe, expect, it } from 'vitest'
import { firstLookFocus, firstLookTarget, openingTarget } from './first-look'

function person(lineage: string, x: number, y: number, alive = true) {
  return { lineage_id: lineage, x, y, alive }
}

function battle(x: number, y: number, started: number, ended = false) {
  return { location: [x, y] as [number, number], started_tick: started, ended }
}

describe('firstLookFocus', () => {
  it('frames a fight already underway, ahead of a meeting and a larger tribe', () => {
    expect(
      firstLookFocus({
        organisms: [
          person('a', 0, 0),
          person('b', 4, 0),
          ...Array.from({ length: 6 }, (_, i) => person('c', 200 + i, 200)),
        ],
        battles: [battle(9, 9, 1), battle(40, 50, 9)],
      }),
    ).toEqual({ x: 40, y: 50 })
  })

  it('frames the closest meeting, and a fight when two pairs are equally close', () => {
    expect(
      firstLookFocus({
        organisms: [person('a', 0, 0), person('b', 11, 0), person('c', 0, 80), person('d', 0, 93)],
      }),
    ).toEqual({ x: 6, y: 0 })

    expect(
      firstLookFocus({
        organisms: [person('c', 0, 30), person('d', 8, 30), person('a', 0, 0), person('b', 8, 0)],
        tribal_relations: [{ a: 'a', b: 'b', status: 'rivals' }],
      }),
    ).toEqual({ x: 4, y: 0 })
  })

  it('frames the first hut closest to finished, not a camp that already stands', () => {
    expect(
      firstLookFocus({
        organisms: [
          ...Array.from({ length: 6 }, (_, i) => person('old', 10 + i, 10)),
          person('new', 80, 80),
          person('new', 81, 80),
        ],
        settlements: [
          { lineage_id: 'old', tier: 2 },
          { lineage_id: 'new', tier: 0 },
        ],
        buildings: [
          { x: 70, y: 70, condition: 0.95, lineage_id: 'new', decorative: true },
          { x: 40, y: 40, condition: 0.4, lineage_id: 'new' },
          { x: 90, y: 90, condition: 0.85, lineage_id: 'new' },
          { x: 12, y: 12, condition: 0.99, lineage_id: 'old' },
        ],
      }),
    ).toEqual({ x: 90, y: 90 })
  })

  it('frames the band nearest a split, not the larger group it would leave', () => {
    const band = [
      person('a', 10, 10),
      person('a', 11, 10),
      person('a', 10, 11),
      person('a', 12, 11),
      person('a', 11, 12),
    ]
    const staying = [0, 1, 2, 3, 4, 5].map((i) => person('a', 200 + (i % 3), 200 + Math.floor(i / 3)))
    expect(firstLookFocus({ organisms: [...staying, ...band] })).toEqual({ x: 11, y: 11 })
  })

  it('frames the largest unsettled cluster in a year-one world', () => {
    const gathered = [person('a', 20, 30), person('a', 21, 30), person('a', 20, 31), person('a', 22, 31)]
    const pair = [person('b', 200, 200), person('b', 201, 200)]
    expect(firstLookFocus({ organisms: [...pair, ...gathered] })).toEqual({ x: 21, y: 31 })
  })

  it('frames a new tribe over a larger one that has already settled, including a head-start world', () => {
    const settled = Array.from({ length: 8 }, (_, i) => person('old', i, 0))
    const fresh = [person('new', 50, 50), person('new', 51, 50), person('new', 50, 52)]
    const remembered = [person('old', 1, 0, false), person('new', 50, 50, false)]
    const world = {
      organisms: [...remembered, ...settled, ...fresh],
      settlements: [{ lineage_id: 'old', tier: 1 }],
      battles: [battle(3, 3, 4, true)],
    }
    expect(firstLookFocus(world)).toEqual({ x: 50, y: 51 })
    expect(firstLookFocus({ ...world, organisms: [...settled, ...fresh] })).toEqual({ x: 50, y: 51 })
  })

  it('returns null when nothing is about to happen, so the usual view can stand', () => {
    expect(
      firstLookFocus({
        organisms: [person('a', 0, 0), person('b', 13, 0), person('c', 0, 100)],
        battles: [battle(4, 4, 2, true)],
      }),
    ).toBeNull()
    expect(firstLookFocus({ organisms: [] })).toBeNull()
    expect(firstLookFocus({ organisms: [person('a', 5, 5, false), person('b', 6, 5, false)] })).toBeNull()
  })
})

describe('openingTarget', () => {
  it('names the tribe about to act along with where it is', () => {
    // A fight: the side with more people alive.
    expect(
      firstLookTarget({
        organisms: [person('a', 0, 0), person('b', 1, 0), person('b', 2, 0)],
        battles: [{ location: [5, 5], started_tick: 3, attackers: ['a'], defenders: ['b'] }],
      }),
    ).toEqual({ x: 5, y: 5, tribe: 'b' })
    // A meeting: the larger of the two tribes meeting.
    expect(
      firstLookTarget({
        organisms: [person('a', 0, 0), person('b', 6, 0), person('b', 60, 60), person('c', 200, 200)],
      }),
    ).toEqual({ x: 3, y: 0, tribe: 'b' })
    // A first hut going up.
    expect(
      firstLookTarget({
        organisms: [person('a', 0, 0), person('b', 100, 100)],
        buildings: [{ x: 40, y: 40, condition: 0.5, lineage_id: 'b' }],
      }),
    ).toEqual({ x: 40, y: 40, tribe: 'b' })
    // The largest unsettled cluster.
    expect(
      firstLookTarget({
        organisms: [person('a', 0, 0), person('a', 1, 0), person('a', 2, 0), person('b', 100, 100)],
      }),
    ).toEqual({ x: 1, y: 0, tribe: 'a' })
  })

  it('falls back to the most populous tribe at its camp when nobody is about to act', () => {
    expect(
      openingTarget({
        organisms: [person('a', 0, 0), person('b', 100, 100), person('b', 160, 100)],
        settlements: [{ lineage_id: 'b', tier: 1, center: [130, 104] }],
      }),
    ).toEqual({ x: 130, y: 104, tribe: 'b' })
    // No camp yet: the middle of its people.
    expect(
      openingTarget({ organisms: [person('a', 0, 0), person('b', 100, 100), person('b', 160, 100)] }),
    ).toEqual({ x: 130, y: 100, tribe: 'b' })
  })

  it('breaks a tie between equally large tribes the same way whatever order they arrive in', () => {
    const one = [person('m', 300, 0), person('m', 330, 0), person('k', 0, 300), person('k', 0, 330)]
    expect(openingTarget({ organisms: one })).toEqual({ x: 0, y: 315, tribe: 'k' })
    expect(openingTarget({ organisms: [...one].reverse() })).toEqual({ x: 0, y: 315, tribe: 'k' })
  })

  it('prefers the group about to act over a larger idle tribe, and is null with nobody alive', () => {
    expect(
      openingTarget({
        organisms: [
          ...Array.from({ length: 8 }, (_, i) => person('big', 300 + i * 20, 300)),
          person('x', 0, 0),
          person('y', 4, 0),
        ],
      }),
    ).toEqual({ x: 2, y: 0, tribe: 'x' })
    expect(openingTarget({ organisms: [person('a', 1, 1, false)] })).toBeNull()
  })
})
