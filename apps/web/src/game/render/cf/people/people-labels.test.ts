import { afterEach, describe, expect, it } from 'vitest'
import type { FaithInfo, OrganismState, PrayerInfo, VehicleInfo } from '../../../../shared/types'
import { resetPrayerFeedback, updatePrayerFeedback } from '../../prayer-feedback'
import { paintPeopleLabels, type PeopleLabelInput, type PeopleLabelSource } from './people-labels'
import { paintPeopleLabelsReference } from './people-labels.reference.test-util'

interface Call {
  fn: string
  args: unknown[]
}

/** A context that records every call and remembers assigned properties. */
function recording() {
  const calls: Call[] = []
  const state: Record<string, unknown> = {}
  const ctx = new Proxy(state, {
    get: (t, key: string) => (key in t ? t[key] : (...args: unknown[]) => calls.push({ fn: key, args })),
    set: (t, key: string, value) => ((t[key] = value), true),
  }) as unknown as CanvasRenderingContext2D
  return { ctx, calls, texts: () => calls.filter((c) => c.fn === 'fillText').map((c) => c.args[0] as string) }
}

function org(id: string, x: number, y: number, extra: Partial<OrganismState> = {}): OrganismState {
  return {
    id,
    name: id.toUpperCase(),
    alive: true,
    x,
    y,
    sex: 'female',
    age: 900,
    energy: 0.9,
    hydration: 0.9,
    health: 0.9,
    infection: 0,
    thought: '',
    lineage_id: 'L',
    ...extra,
  } as unknown as OrganismState
}

function source(orgs: OrganismState[], hidden: number[] = []): PeopleLabelSource {
  return {
    orgs,
    px: orgs.map((o) => o.x * 8 + 4),
    py: orgs.map((o) => o.y * 8 + 4),
    hidden: orgs.map((_, i) => (hidden.includes(i) ? 1 : 0)),
    phase: orgs.map(() => 0),
    step: { flipped: orgs.map(() => 0), movedAt: orgs.map(() => -Infinity) },
  }
}

function input(over: Partial<PeopleLabelInput> & { people: PeopleLabelSource }): PeopleLabelInput {
  return {
    selectedId: null,
    focus: 'all',
    viewFlags: { names: true, thoughts: true, hideUI: false },
    zoom: 3,
    now: 5000,
    prayers: undefined,
    vehicles: undefined,
    settlementLabels: [],
    window: { c0: 0, c1: 100, r0: 0, r1: 100 },
    ox: 0,
    oy: 0,
    ...over,
  }
}

describe('people labels', () => {
  it('writes a name above each person when zoomed in', () => {
    const r = recording()
    paintPeopleLabels(r.ctx, input({ people: source([org('ada', 10, 10), org('bo', 30, 30)]) }))
    expect(r.texts()).toEqual(['ADA', 'BO'])
  })

  it('outlines the name in black before filling it white', () => {
    const r = recording()
    paintPeopleLabels(r.ctx, input({ people: source([org('ada', 10, 10)]) }))
    const strokeAt = r.calls.findIndex((c) => c.fn === 'strokeText')
    const fillAt = r.calls.findIndex((c) => c.fn === 'fillText')
    expect(strokeAt).toBeGreaterThanOrEqual(0)
    expect(strokeAt).toBeLessThan(fillAt)
  })

  it('draws nothing zoomed out unless someone is selected', () => {
    const people = source([org('ada', 10, 10)])
    const none = recording()
    paintPeopleLabels(none.ctx, input({ people, zoom: 0.4 }))
    expect(none.calls).toHaveLength(0)
    const selected = recording()
    paintPeopleLabels(selected.ctx, input({ people, zoom: 0.4, selectedId: 'ada' }))
    expect(selected.texts()).toEqual(['ADA'])
  })

  it('skips people resting indoors and people off screen', () => {
    const r = recording()
    paintPeopleLabels(
      r.ctx,
      input({
        people: source([org('in', 10, 10), org('out', 200, 10), org('seen', 20, 20)], [0]),
      }),
    )
    expect(r.texts()).toEqual(['SEEN'])
  })

  it('leaves out a name that would sit on a town name, but never the selected person', () => {
    const people = source([org('ada', 10, 10)])
    const label = { cx: 84, cy: 70, w: 120, h: 30 } as never
    const hidden = recording()
    paintPeopleLabels(hidden.ctx, input({ people, settlementLabels: [label] }))
    expect(hidden.texts()).toEqual([])
    const shown = recording()
    paintPeopleLabels(shown.ctx, input({ people, settlementLabels: [label], selectedId: 'ada' }))
    expect(shown.texts()).toContain('ADA')
  })

  it('shows the selected person thought, and everyone only at full detail', () => {
    const people = source([org('ada', 10, 10, { thought: 'looking for water' })])
    const close = recording()
    paintPeopleLabels(close.ctx, input({ people, zoom: 5 }))
    expect(close.texts()).toContain('looking for water')
    const mid = recording()
    paintPeopleLabels(mid.ctx, input({ people, zoom: 1.5 }))
    expect(mid.texts()).not.toContain('looking for water')
    const picked = recording()
    paintPeopleLabels(picked.ctx, input({ people, zoom: 1.5, selectedId: 'ada' }))
    expect(picked.texts()).toContain('looking for water')
  })

  it('draws a work pose for someone working, and the prayer glyph for a praying tribe', () => {
    const worker = org('ada', 10, 10, { thought: 'chopping wood' })
    const poses = recording()
    paintPeopleLabels(
      poses.ctx,
      input({ people: source([worker]), viewFlags: { names: false, thoughts: false, hideUI: false } }),
    )
    expect(poses.calls.some((c) => c.fn === 'rotate' || c.fn === 'fillRect')).toBe(true)

    const prayer = { lineage_id: 'L', x: 10, y: 10 } as never
    const wantGlyph = org('ada', 10, 10)
    // The glyph appears for people whose id characters sum to an even seed.
    const seeds = [wantGlyph].map((o) => o.id.charCodeAt(0) + o.id.charCodeAt(o.id.length - 1))
    expect(seeds[0] % 2).toBe(0)
    const praying = recording()
    paintPeopleLabels(
      praying.ctx,
      input({
        people: source([wantGlyph]),
        prayers: [prayer],
        viewFlags: { names: false, thoughts: false, hideUI: false },
      }),
    )
    expect(praying.calls.filter((c) => c.fn === 'fillRect')).toHaveLength(4)
    const quiet = recording()
    paintPeopleLabels(
      quiet.ctx,
      input({
        people: source([wantGlyph]),
        prayers: [prayer],
        viewFlags: { names: false, thoughts: false, hideUI: true },
      }),
    )
    expect(quiet.calls.filter((c) => c.fn === 'fillRect')).toHaveLength(0)
  })
})

/** Deterministic random numbers, so a failing scenario can be replayed. */
function rng(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const THOUGHTS = [
  '',
  'observing',
  'exploring',
  'looking for water',
  'chopping wood',
  'mining stone',
  'harvesting crops',
  'fishing',
  'resting',
  'foraging',
  'building a hut',
  'sounding alarm',
  '"hello!"',
]

/** A crowd with every feature the painter reads: names or none, thoughts, lineages, low vitals, ties in y. */
function randomCrowd(seed: number, n: number) {
  const rand = rng(seed)
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]
  const orgs: OrganismState[] = []
  for (let i = 0; i < n; i++) {
    // Whole-tile positions now and then, so equal depths exercise the id tie-break.
    const tied = rand() < 0.3
    const x = tied ? Math.floor(rand() * 40) + 10 : rand() * 40 + 10
    const y = tied ? Math.floor(rand() * 30) + 10 : rand() * 30 + 10
    orgs.push(
      org(`${pick(['a', 'b', 'c', 'd'])}${Math.floor(rand() * 1e6).toString(16)}${i}`, x, y, {
        name: rand() < 0.1 ? '' : `Name${i}`,
        sex: rand() < 0.5 ? 'male' : 'female',
        thought: pick(THOUGHTS),
        lineage_id: pick(['L1', 'L2', 'L3']),
        energy: rand() < 0.1 ? 0.1 : 0.9,
        hydration: rand() < 0.1 ? 0.1 : 0.9,
        health: rand() < 0.1 ? 0.1 : 0.9,
        infection: rand() < 0.2 ? 0.5 : 0,
        is_elder: rand() < 0.2,
      }),
    )
  }
  const people: PeopleLabelSource = {
    orgs,
    px: orgs.map((o) => o.x * 8 + 4),
    py: orgs.map((o) => o.y * 8 + 4),
    hidden: orgs.map(() => (rand() < 0.1 ? 1 : 0)),
    phase: orgs.map(() => Math.floor(rand() * 1000)),
    step: {
      flipped: orgs.map(() => (rand() < 0.5 ? 1 : 0)),
      movedAt: orgs.map(() => (rand() < 0.3 ? 4950 : -Infinity)),
    },
  }
  return { orgs, people, rand, pick }
}

describe('people labels, cheap painter against the original', () => {
  afterEach(() => resetPrayerFeedback())

  const scenarios = [
    { n: 60, zoom: 3 },
    { n: 60, zoom: 1.5 },
    { n: 60, zoom: 0.4 },
    { n: 700, zoom: 3 },
    { n: 900, zoom: 5 },
    { n: 900, zoom: 1.2 },
  ]
  for (const { n, zoom } of scenarios) {
    for (const seed of [1, 2, 3]) {
      it(`draws exactly what it drew before (${n} people, zoom ${zoom}, seed ${seed})`, () => {
        const { orgs, people, rand, pick } = randomCrowd(seed * 100 + n, n)
        const prayers = [
          { id: 1, lineage_id: 'L1', x: 30, y: 25 },
          { id: 2, lineage_id: 'L2', x: 15, y: 15 },
        ] as unknown as PrayerInfo[]
        const vehicles = orgs
          .filter(() => rand() < 0.05)
          .map((o) => ({ kind: 'boat', rider_id: o.id }) as unknown as VehicleInfo)
        // L3 just had a prayer answered: its people near it dance.
        updatePrayerFeedback(
          [{ id: 9, lineage_id: 'L3', x: 30, y: 20 }] as unknown as PrayerInfo[],
          { blessed: [], despairing: [] } as unknown as FaithInfo,
          4000,
        )
        updatePrayerFeedback([], { blessed: ['L3'], despairing: [] } as unknown as FaithInfo, 4500)
        const base: PeopleLabelInput = {
          people,
          selectedId: rand() < 0.7 ? pick(orgs).id : null,
          focus: pick(['all', 'all', 'sick', 'lineage:L2', 'hungry']),
          viewFlags: { names: rand() < 0.8, thoughts: rand() < 0.6, hideUI: rand() < 0.2 },
          zoom,
          now: 5000,
          prayers: rand() < 0.8 ? prayers : undefined,
          vehicles: rand() < 0.5 ? vehicles : undefined,
          settlementLabels: [
            { cx: 200, cy: 200, w: 120, h: 24 } as never,
            { cx: 300, cy: 260, w: 90, h: 24 } as never,
          ],
          window: { c0: 5, c1: 45, r0: 5, r1: 38 },
          ox: 0,
          oy: 0,
        }
        const fast = recording()
        const old = recording()
        paintPeopleLabels(fast.ctx, base)
        paintPeopleLabelsReference(old.ctx, base)
        expect(fast.calls).toEqual(old.calls)
        if (zoom > 1) expect(fast.calls.length).toBeGreaterThan(0)
        // Again on the same crowd, a moment later: scratch buffers kept from the last frame must not leak in.
        const again = recording()
        paintPeopleLabels(again.ctx, { ...base, now: 5030 })
        const againOld = recording()
        paintPeopleLabelsReference(againOld.ctx, { ...base, now: 5030 })
        expect(again.calls).toEqual(againOld.calls)
      })
    }
  }
})
