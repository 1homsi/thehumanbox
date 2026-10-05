import { describe, expect, it } from 'vitest'
import type { OrganismState } from '../../../../shared/types'
import { paintPeopleLabels, type PeopleLabelInput, type PeopleLabelSource } from './people-labels'

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
