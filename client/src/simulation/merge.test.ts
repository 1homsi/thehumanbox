import { describe, it, expect } from 'vitest'
import { mergeFrame, type MergeCaches } from './merge'
import type { IncomingWorldFrame } from './wire'
import type { OrganismState, AnimalState } from '../types'

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
