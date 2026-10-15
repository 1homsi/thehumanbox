import { describe, it, expect } from 'vitest'
import { mergeFrame, type MergeCaches } from './merge'
import type { IncomingWorldFrame, OrgsHotSoa } from './wire'
import type { OrganismState, AnimalState, Building } from '../shared/types'

function emptyCaches(): MergeCaches {
  return {
    organisms: new Map<string, OrganismState>(),
    animals: new Map<number, AnimalState>(),
    grid: null,
    prevWorld: null,
  }
}

function baseFrame(overrides: Partial<IncomingWorldFrame> = {}): IncomingWorldFrame {
  return {
    frame_id: 1,
    server_sent_at_ms: 0,
    frame_kind: 'delta',
    tick: 0,
    is_day: true,
    day_progress: 0,
    season: 'recovery',
    season_progress: 0,
    drought: false,
    weather: { kind: 'clear', intensity: 0 },
    grid: { width: 4, height: 3, origin_x: 0, origin_y: 0, fire: [], structure: [] },
    organisms_complete: false,
    animals: [],
    animals_complete: false,
    ...overrides,
  }
}

describe('mergeFrame organism handling', () => {
  it('carries lineage word summaries across deltas without organism vocabularies', () => {
    const caches = emptyCaches()
    const words = { lineage: { food: 'mara', home: 'tora' } }
    const first = mergeFrame(
      baseFrame({ frame_kind: 'full', organisms_complete: true, lineage_words: words }),
      caches,
    )
    caches.prevWorld = first.next
    const next = mergeFrame(baseFrame({ frame_id: 2 }), caches)

    expect(first.next.lineage_words).toEqual(words)
    expect(next.next.lineage_words).toEqual(words)
    expect(next.next.organisms).toEqual([])
  })

  it('drops a delta-only org that has no prior cache entry', () => {
    // SoA delta arrives carrying an id the cache has never seen. The
    // cold fields (name, lineage_id, traits) aren't on the wire, so
    // inserting the record would corrupt every downstream renderer
    // that reads those fields off the cached entry. The merge layer
    // should silently drop the orphan and wait for the next full
    // frame to seed the cache.
    const caches = emptyCaches()
    const frame = baseFrame({
      organisms_hot: {
        ids: ['ghost-1'],
        xs: [100],
        ys: [100],
        vxs: [0],
        vys: [0],
        energies: [50],
        hydrations: [50],
        healths: [50],
        thoughts: [],
        infections: [0],
        fear_levels: [0],
        carryings: [0],
        carrying_types: [0],
        pregnants: [false],
        partner_ids: [],
        attracted_tos: [],
      },
    })
    const res = mergeFrame(frame, caches)
    expect(caches.organisms.has('ghost-1')).toBe(false)
    expect(res.next.organisms.length).toBe(0)
  })

  it('seeds the cache on a full frame, then merges subsequent deltas', () => {
    const caches = emptyCaches()
    // Full frame seeds cold fields.
    const fullOrg: OrganismState = {
      id: 'a',
      name: 'Alia',
      lineage_id: 'lin-x',
      x: 50,
      y: 50,
      vx: 0,
      vy: 0,
      energy: 0.8,
      hydration: 0.8,
      health: 0.9,
      age: 100,
      alive: true,
      thought: 'starting',
      infection: 0,
      fear_level: 0,
      carrying: 0,
      carrying_type: 0,
      pregnant: false,
      generation: 1,
      max_age: 5000,
      traits: {
        aggression: 0.5,
        curiosity: 0.5,
        social_tendency: 0.5,
        memory_strength: 0.5,
        resilience: 0.5,
      },
    } as unknown as OrganismState
    const fullFrame = baseFrame({
      frame_kind: 'full',
      organisms_complete: true,
      organisms: [fullOrg],
    })
    mergeFrame(fullFrame, caches)
    expect(caches.organisms.get('a')?.name).toBe('Alia')

    // Delta updates a hot field - cold fields preserved.
    const deltaFrame = baseFrame({
      frame_id: 2,
      organisms_hot: {
        ids: ['a'],
        xs: [600],
        ys: [500],
        vxs: [3],
        vys: [-1],
        energies: [70],
        hydrations: [70],
        healths: [85],
        thoughts: [[0, 'wandering']],
        infections: [0],
        fear_levels: [0],
        carryings: [0],
        carrying_types: [0],
        pregnants: [false],
        partner_ids: [],
        attracted_tos: [],
      },
    })
    mergeFrame(deltaFrame, caches)
    const merged = caches.organisms.get('a')!
    expect(merged.name).toBe('Alia') // cold preserved
    expect(merged.lineage_id).toBe('lin-x') // cold preserved
    expect(merged.x).toBeCloseTo(60, 5) // 600 / 10
    expect(merged.thought).toBe('wandering') // sparse thought applied
    expect(merged.energy).toBeCloseTo(0.7, 5)
  })

  it('reuses an unchanged GridState across identical frames (allocator stability)', () => {
    const caches = emptyCaches()
    const r1 = mergeFrame(baseFrame(), caches)
    // Real call sites copy r1.grid back into caches.grid; do the
    // same here.
    caches.grid = r1.grid
    const r2 = mergeFrame(baseFrame(), caches)
    // applyGridWire's row-array reuse contract: identical successive
    // frames produce the same row-array references inside the grid.
    expect(r2.grid.fire_intensity).toBe(r1.grid.fire_intensity)
    expect(r2.grid.structure).toBe(r1.grid.structure)
  })

  it('carries strategy objectives and campaign history across delta frames', () => {
    const caches = emptyCaches()
    const first = mergeFrame(
      baseFrame({
        lineage_strategies: {
          'lin-a': {
            strategy: 'settle',
            expires_tick: 900,
            started_tick: 300,
            progress: 40,
            target: 100,
            completed: false,
            status: 'active',
          },
        },
        lineage_strategy_history: [
          {
            lineage_id: 'lin-a',
            lineage_name: 'Lineage A',
            strategy: 'explore',
            started_tick: 100,
            ended_tick: 250,
            progress: 60,
            target: 60,
            outcome: 'completed',
            reason: null,
          },
        ],
      }),
      caches,
    )
    caches.prevWorld = first.next

    const inherited = mergeFrame(baseFrame({ frame_id: 2, tick: 301 }), caches)
    expect(inherited.next.lineage_strategies?.['lin-a']?.progress).toBe(40)
    expect(inherited.next.lineage_strategy_history?.[0]?.outcome).toBe('completed')
    caches.prevWorld = inherited.next

    const cleared = mergeFrame(
      baseFrame({
        frame_id: 3,
        tick: 900,
        lineage_strategies: {},
        lineage_strategy_history: [
          {
            lineage_id: 'lin-a',
            lineage_name: 'Lineage A',
            strategy: 'settle',
            started_tick: 300,
            ended_tick: 900,
            progress: 78,
            target: 100,
            outcome: 'expired',
            reason: 'deadline',
          },
        ],
      }),
      caches,
    )
    expect(cleared.next.lineage_strategies).toEqual({})
    expect(cleared.next.lineage_strategy_history?.[0]?.outcome).toBe('expired')
  })
})

describe('mergeFrame lineage strategy handling', () => {
  it('retains guidance across deltas and lets a full frame clear it', () => {
    const caches = emptyCaches()
    const guidance = {
      'lin-x': {
        strategy: 'explore' as const,
        expires_tick: 2_000,
      },
    }

    const full = mergeFrame(
      baseFrame({
        frame_kind: 'full',
        lineage_strategies: guidance,
      }),
      caches,
    )
    expect(full.next.lineage_strategies).toEqual(guidance)

    caches.prevWorld = full.next
    const delta = mergeFrame(baseFrame({ frame_id: 2, tick: 1 }), caches)
    expect(delta.next.lineage_strategies).toBe(full.next.lineage_strategies)

    caches.prevWorld = delta.next
    const cleared = mergeFrame(
      baseFrame({
        frame_id: 3,
        frame_kind: 'full',
        tick: 2,
        lineage_strategies: {},
      }),
      caches,
    )
    expect(cleared.next.lineage_strategies).toEqual({})
  })
})

describe('mergeFrame null-clear identity stability', () => {
  // A delta whose only content is "this field is now cleared" must not
  // allocate. The server sends the -32768 sentinel every frame for an
  // organism with no wander target, which the wire turns into an explicit
  // `null`. Comparing that `null` against a cached `undefined` with `!==`
  // reported a change forever, so every organism was reallocated 10x/s even
  // when nothing about it had changed.
  const noTargetDelta = (frameId: number) =>
    baseFrame({
      frame_id: frameId,
      organisms_hot: {
        ids: ['a'],
        target_xs: [-32768],
        target_ys: [-32768],
      },
    } as Partial<IncomingWorldFrame>)

  function seed(): { caches: MergeCaches; org: OrganismState } {
    const caches = emptyCaches()
    const org = { id: 'a', name: 'Alia', x: 5, y: 5 } as unknown as OrganismState
    mergeFrame(baseFrame({ frame_kind: 'full', organisms_complete: true, organisms: [org] }), caches)
    return { caches, org: caches.organisms.get('a')! }
  }

  it('reuses the cached organism when the wire clears a never-set field', () => {
    const { caches, org } = seed()
    expect('target_x' in org).toBe(false)

    mergeFrame(noTargetDelta(2), caches)
    const after1 = caches.organisms.get('a')!
    expect(after1).toBe(org)
    expect('target_x' in after1).toBe(false)

    // And it stays stable over many frames, not just the first.
    for (let i = 3; i < 25; i++) mergeFrame(noTargetDelta(i), caches)
    expect(caches.organisms.get('a')).toBe(org)
  })

  it('still clears a field that was previously set', () => {
    const caches = emptyCaches()
    const org = { id: 'a', name: 'Alia', target_x: 40 } as unknown as OrganismState
    mergeFrame(baseFrame({ frame_kind: 'full', organisms_complete: true, organisms: [org] }), caches)
    expect(caches.organisms.get('a')!.target_x).toBe(40)

    mergeFrame(noTargetDelta(2), caches)
    const after = caches.organisms.get('a')!
    expect('target_x' in after).toBe(false)
  })

  it('keeps identity across a clear-then-reassert cycle', () => {
    const caches = emptyCaches()
    const org = { id: 'a', name: 'Alia' } as unknown as OrganismState
    mergeFrame(baseFrame({ frame_kind: 'full', organisms_complete: true, organisms: [org] }), caches)
    mergeFrame(noTargetDelta(2), caches)
    const cleared = caches.organisms.get('a')!

    // A real target reappears, then is cleared again. The second clear must
    // reuse the object the reassert produced.
    mergeFrame(
      baseFrame({
        frame_id: 3,
        organisms_hot: { ids: ['a'], target_xs: [120], target_ys: [-32768] },
      } as Partial<IncomingWorldFrame>),
      caches,
    )
    const reasserted = caches.organisms.get('a')!
    expect(reasserted).not.toBe(cleared)
    expect(reasserted.target_x).toBe(120)

    // Clearing a field that *was* set is a real change, so it allocates.
    mergeFrame(noTargetDelta(4), caches)
    const recleared = caches.organisms.get('a')!
    expect(recleared).not.toBe(reasserted)
    expect('target_x' in recleared).toBe(false)

    // From here on the field is absent again, so clears must be free.
    for (let i = 5; i < 30; i++) mergeFrame(noTargetDelta(i), caches)
    expect(caches.organisms.get('a')).toBe(recleared)
  })
})

describe('mergeFrame trade network handling', () => {
  it('retains moving routes across sparse deltas and accepts authoritative empty arrays', () => {
    const caches = emptyCaches()
    const tradeRoutes = [
      {
        id: 3,
        lineage_a: 'lin-a',
        lineage_b: 'lin-b',
        a_center: [10, 20] as [number, number],
        b_center: [80, 90] as [number, number],
        established_tick: 100,
        last_dispatch_tick: 120,
        deliveries: 2,
        volume: 5,
      },
    ]
    const caravans = [
      {
        id: 4,
        route_id: 3,
        sender_lineage: 'lin-a',
        receiver_lineage: 'lin-b',
        sender_org_id: 'org-a',
        cargo: 'food',
        amount: 2,
        unit_price: 3,
        departed_tick: 120,
        arrives_tick: 240,
        from: [10, 20] as [number, number],
        to: [80, 90] as [number, number],
      },
    ]

    const first = mergeFrame(baseFrame({ frame_kind: 'full', trade_routes: tradeRoutes, caravans }), caches)
    caches.prevWorld = first.next
    const sparse = mergeFrame(baseFrame({ frame_id: 2, tick: 121 }), caches)
    expect(sparse.next.trade_routes).toBe(tradeRoutes)
    expect(sparse.next.caravans).toBe(caravans)

    caches.prevWorld = sparse.next
    const arrived = mergeFrame(
      baseFrame({ frame_id: 3, tick: 240, trade_routes: tradeRoutes, caravans: [] }),
      caches,
    )
    expect(arrived.next.trade_routes).toBe(tradeRoutes)
    expect(arrived.next.caravans).toEqual([])
  })
})

describe('mergeFrame civilization state handling', () => {
  it('preserves cold civilization payloads across deltas and accepts authoritative empty updates', () => {
    const caches = emptyCaches()
    const territory = {
      claimed: [{ lid: 'lin-x', tiles: [[2, 3] as [number, number]] }],
      contested: [] as [number, number][],
    }
    const trades = [
      {
        tick: 1,
        buyer_id: 'a',
        seller_id: 'b',
        good: 'grain',
        amount: 2,
        price: 4,
      },
    ]
    const governments = [{ lineage_id: 'lin-x', kind: 'council', laws: ['commons'] }]
    const artworks = [
      {
        id: 1,
        kind: 'mural',
        title: 'Dawn',
        creator_name: 'Alia',
        x: 2,
        y: 3,
      },
    ]
    const buildings: Building[] = [
      {
        id: 9,
        kind: 'house',
        x: 2,
        y: 3,
        condition: 1,
        damage: 0.6,
        integrity: 0.4,
        ruined: false,
        repairing: true,
      },
    ]

    const full = mergeFrame(
      baseFrame({
        frame_kind: 'full',
        territory,
        trades,
        governments,
        artworks,
        buildings,
      }),
      caches,
    )
    expect(full.next.territory).toBe(territory)
    expect(full.next.trades).toBe(trades)
    expect(full.next.governments).toBe(governments)
    expect(full.next.artworks).toBe(artworks)
    expect(full.next.buildings).toBe(buildings)

    caches.prevWorld = full.next
    const delta = mergeFrame(baseFrame({ frame_id: 2, tick: 2 }), caches)
    expect(delta.next.territory).toBe(territory)
    expect(delta.next.trades).toBe(trades)
    expect(delta.next.governments).toBe(governments)
    expect(delta.next.artworks).toBe(artworks)
    expect(delta.next.buildings).toBe(buildings)

    caches.prevWorld = delta.next
    const rebuiltBuildings: Building[] = [
      {
        ...buildings[0],
        damage: 0,
        integrity: 1,
        repairing: false,
      },
    ]
    const rebuilt = mergeFrame(
      baseFrame({
        frame_id: 3,
        tick: 3,
        buildings: rebuiltBuildings,
      }),
      caches,
    )
    expect(rebuilt.next.buildings).toBe(rebuiltBuildings)

    caches.prevWorld = rebuilt.next
    const cleared = mergeFrame(
      baseFrame({
        frame_id: 4,
        frame_kind: 'full',
        tick: 4,
        territory: { claimed: [], contested: [] },
        trades: [],
        governments: [],
        artworks: [],
        buildings: [],
      }),
      caches,
    )
    expect(cleared.next.territory).toEqual({ claimed: [], contested: [] })
    expect(cleared.next.trades).toEqual([])
    expect(cleared.next.governments).toEqual([])
    expect(cleared.next.artworks).toEqual([])
    expect(cleared.next.buildings).toEqual([])
  })
})

describe('mergeFrame SoA columns', () => {
  const seedOrg = (id: string, extra: Record<string, unknown> = {}) =>
    ({ id, name: id, x: 0, y: 0, vx: 0, vy: 0, age: 7, alive: true, ...extra }) as unknown as OrganismState

  function seeded(...orgs: OrganismState[]): MergeCaches {
    const caches = emptyCaches()
    mergeFrame(baseFrame({ frame_kind: 'full', organisms_complete: true, organisms: orgs }), caches)
    return caches
  }

  const soa = (over: Partial<OrgsHotSoa>): IncomingWorldFrame =>
    baseFrame({ frame_id: 2, organisms_hot: { ids: [], thoughts: [], ...over } as unknown as OrgsHotSoa })

  it('scales the columns and keeps `age` and `alive` when the SoA omits them', () => {
    const caches = seeded(seedOrg('a'))
    const res = mergeFrame(
      soa({
        ids: ['a'],
        xs: [100],
        ys: [200],
        vxs: [5],
        vys: [-5],
        energies: [80],
        hydrations: [80],
        healths: [90],
        infections: [0],
        fear_levels: [0],
        carryings: [0],
        carrying_types: [0],
        pregnants: [false],
        partner_ids: [],
        attracted_tos: [],
      }),
      caches,
    )
    const org = caches.organisms.get('a')!
    expect(org.x).toBeCloseTo(10, 5)
    expect(org.y).toBeCloseTo(20, 5)
    expect(org.vx).toBeCloseTo(0.5, 5)
    expect(org.energy).toBeCloseTo(0.8, 5)
    expect(org.health).toBeCloseTo(0.9, 5)
    // age and alive are not on the wire: the cached values persist.
    expect(org.age).toBe(7)
    expect(org.alive).toBe(true)
    expect('thought' in org).toBe(false)
    expect(org.partner_id).toBeUndefined()
    expect(res.next.viewport_organisms).toEqual([org])
  })

  it('honours ages, alives and dense thoughts when the SoA carries them (legacy)', () => {
    const caches = seeded(seedOrg('b'))
    mergeFrame(
      soa({
        ids: ['b'],
        ages: [1234],
        alives: [false],
        thoughts: ['exploring'],
        partner_ids: [null],
        attracted_tos: [null],
      }),
      caches,
    )
    const org = caches.organisms.get('b')!
    expect(org.age).toBe(1234)
    expect(org.alive).toBe(false)
    expect(org.thought).toBe('exploring')
    expect(org.partner_id).toBeUndefined()
  })

  it('reads sparse thought / partner / attracted entries by index', () => {
    const caches = seeded(seedOrg('a'), seedOrg('b'), seedOrg('c'))
    mergeFrame(
      soa({
        ids: ['a', 'b', 'c'],
        thoughts: [[1, 'wandering']],
        partner_ids: [[0, 'b']],
        attracted_tos: [[2, 'a']],
      }),
      caches,
    )
    expect(caches.organisms.get('a')!.partner_id).toBe('b')
    expect(caches.organisms.get('b')!.partner_id).toBeUndefined()
    expect(caches.organisms.get('b')!.thought).toBe('wandering')
    expect(caches.organisms.get('c')!.attracted_to).toBe('a')
  })

  it('reuses unchanged records and the organism list, replacing only the one that moved', () => {
    const caches = seeded(seedOrg('a', { x: 1 }), seedOrg('b', { x: 2 }))
    const first = mergeFrame(soa({ ids: ['a', 'b'], xs: [10, 20] }), caches)
    caches.prevWorld = first.next
    const a1 = caches.organisms.get('a')!
    const b1 = caches.organisms.get('b')!

    const same = mergeFrame(soa({ ids: ['a', 'b'], xs: [10, 20] }), caches)
    expect(caches.organisms.get('a')).toBe(a1)
    expect(same.next.organisms).toBe(first.next.organisms)
    caches.prevWorld = same.next

    const moved = mergeFrame(soa({ ids: ['a', 'b'], xs: [10, 30] }), caches)
    expect(caches.organisms.get('a')).toBe(a1)
    expect(caches.organisms.get('b')).not.toBe(b1)
    expect(moved.next.organisms).not.toBe(same.next.organisms)
    expect(moved.next.viewport_organisms).toEqual([a1, caches.organisms.get('b')])
  })
})
