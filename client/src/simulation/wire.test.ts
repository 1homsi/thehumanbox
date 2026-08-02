import { describe, it, expect } from 'vitest'
import { applyGridWire, expandOrgsSoa } from './wire'
import type { GridWire } from '../types'

const emptyWire = (w = 4, h = 3): GridWire => ({
  width: w,
  height: h,
  origin_x: 0,
  origin_y: 0,
  fire: [],
  structure: [],
})

describe('applyGridWire', () => {
  it('reuses the same row arrays across successive frames when dims match', () => {
    const first = applyGridWire(emptyWire(), null)
    const firstFireRow0 = first.fire_intensity[0]
    const firstStructureRow0 = first.structure[0]

    const second = applyGridWire(emptyWire(), first)

    // The applyGridWire reuse-cache contract: when wire dims match the
    // cached grid, the same outer arrays (and the same row sub-arrays)
    // are reused. This is the only thing keeping the per-tick GC
    // pressure off the renderer at high tick rates.
    expect(second.fire_intensity).toBe(first.fire_intensity)
    expect(second.fire_intensity[0]).toBe(firstFireRow0)
    expect(second.structure).toBe(first.structure)
    expect(second.structure[0]).toBe(firstStructureRow0)
  })

  it('allocates fresh arrays when the grid resizes', () => {
    const first = applyGridWire(emptyWire(4, 3), null)
    const second = applyGridWire(emptyWire(5, 3), first)
    expect(second.fire_intensity).not.toBe(first.fire_intensity)
  })

  it('clears stale values before applying the new wire', () => {
    const w1 = emptyWire(2, 2)
    w1.fire = [[0, 0, 250]] // value/1000 → 0.25 at (0,0)
    const first = applyGridWire(w1, null)
    expect(first.fire_intensity[0][0]).toBeCloseTo(0.25, 5)

    const w2 = emptyWire(2, 2) // no fire records
    const second = applyGridWire(w2, first)
    // Old fire value must be zeroed; the reuse loop in take2D walks
    // the cached rows and resets them to the fill value before
    // applying the new sparse records.
    expect(second.fire_intensity[0][0]).toBe(0)
  })

  it('keeps trail layers from the previous frame when wire has no trails record', () => {
    const w1 = emptyWire(2, 2)
    w1.trails = [[0, 0, 80, 0, 0]]
    const first = applyGridWire(w1, null)
    expect(first.food_trail?.[0][0]).toBeCloseTo(0.8, 5)

    const w2 = emptyWire(2, 2) // no trails field
    const second = applyGridWire(w2, first)
    // Without a trails record we hold onto the previous frame's
    // arrays - same reference, value unchanged.
    expect(second.food_trail).toBe(first.food_trail)
    expect(second.food_trail?.[0][0]).toBeCloseTo(0.8, 5)
  })

  it('publishes restored biome maps on full frames and retains them across sparse deltas', () => {
    const initial = emptyWire(2, 2)
    initial.biomes = [
      [0, 0],
      [0, 0],
    ]
    const first = applyGridWire(initial, null)
    expect(first.biomes?.[0][0]).toBe(0)

    const restored = emptyWire(2, 2)
    restored.biomes = [
      [3, 0],
      [0, 1],
    ]
    const second = applyGridWire(restored, first)
    expect(second.biomes?.[0][0]).toBe(3)
    expect(second.biomes?.[1][1]).toBe(1)

    const delta = applyGridWire(emptyWire(2, 2), second)
    expect(delta.biomes).toBe(second.biomes)
    expect(delta.biomes?.[0][0]).toBe(3)
  })
})

describe('expandOrgsSoa', () => {
  it('omits `age` and `alive` from the expanded delta when those SoA fields are absent', () => {
    const expanded = expandOrgsSoa({
      ids: ['a'],
      xs: [100],
      ys: [200],
      vxs: [0],
      vys: [0],
      energies: [80],
      hydrations: [80],
      healths: [90],
      // alives intentionally omitted (new sparse delta path).
      thoughts: [], // sparse-empty form
      infections: [0],
      fear_levels: [0],
      carryings: [0],
      carrying_types: [0],
      pregnants: [false],
      partner_ids: [], // sparse-empty
      attracted_tos: [], // sparse-empty
    })
    expect(expanded[0].id).toBe('a')
    expect(expanded[0].x).toBeCloseTo(10, 5)
    expect(expanded[0].vx).toBe(0)
    expect('age' in expanded[0]).toBe(false)
    // alives dropped from deltas; client merge keeps cached value.
    expect('alive' in expanded[0]).toBe(false)
    // thoughts is sparse with no entry for this org → no thought field.
    expect('thought' in expanded[0]).toBe(false)
    expect(expanded[0].partner_id).toBeUndefined()
    expect(expanded[0].attracted_to).toBeUndefined()
  })

  it('honours ages and alives when the SoA carries them (legacy)', () => {
    const expanded = expandOrgsSoa({
      ids: ['b'],
      xs: [0],
      ys: [0],
      vxs: [0],
      vys: [0],
      energies: [0],
      hydrations: [0],
      healths: [0],
      ages: [1234],
      alives: [true],
      thoughts: ['exploring'], // dense form (legacy)
      infections: [0],
      fear_levels: [0],
      carryings: [0],
      carrying_types: [0],
      pregnants: [false],
      partner_ids: [null],
      attracted_tos: [null],
    })
    expect(expanded[0].age).toBe(1234)
    expect(expanded[0].alive).toBe(true)
    expect(expanded[0].thought).toBe('exploring')
  })

  it('reads sparse thought / partner / attracted entries', () => {
    const expanded = expandOrgsSoa({
      ids: ['a', 'b', 'c'],
      xs: [0, 10, 20],
      ys: [0, 0, 0],
      vxs: [0, 0, 0],
      vys: [0, 0, 0],
      energies: [50, 50, 50],
      hydrations: [50, 50, 50],
      healths: [50, 50, 50],
      thoughts: [[1, 'wandering']],
      infections: [0, 0, 0],
      fear_levels: [0, 0, 0],
      carryings: [0, 0, 0],
      carrying_types: [0, 0, 0],
      pregnants: [false, false, false],
      partner_ids: [[0, 'b']],
      attracted_tos: [[2, 'a']],
    })
    expect(expanded[0].partner_id).toBe('b')
    expect(expanded[1].partner_id).toBeUndefined()
    expect(expanded[1].thought).toBe('wandering')
    expect(expanded[2].attracted_to).toBe('a')
  })
})
