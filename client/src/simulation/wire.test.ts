import { describe, it, expect } from 'vitest'
import { applyGridWire, expandOrgsSoa } from './wire'
import type { GridWire } from '../types'

const emptyWire = (w = 4, h = 3): GridWire => ({
  width:  w,
  height: h,
  origin_x: 0,
  origin_y: 0,
  fire:      [],
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
    const first  = applyGridWire(emptyWire(4, 3), null)
    const second = applyGridWire(emptyWire(5, 3), first)
    expect(second.fire_intensity).not.toBe(first.fire_intensity)
  })

  it('clears stale values before applying the new wire', () => {
    const w1 = emptyWire(2, 2)
    w1.fire = [[0, 0, 250]]      // value/1000 → 0.25 at (0,0)
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
    // arrays — same reference, value unchanged.
    expect(second.food_trail).toBe(first.food_trail)
    expect(second.food_trail?.[0][0]).toBeCloseTo(0.8, 5)
  })
})

describe('expandOrgsSoa', () => {
  it('omits `age` from the expanded delta when the SoA has no ages field', () => {
    const expanded = expandOrgsSoa({
      ids:        ['a'],
      xs:         [100],
      ys:         [200],
      vxs:        [0],
      vys:        [0],
      energies:   [80],
      hydrations: [80],
      healths:    [90],
      alives:     [true],
      thoughts:   [''],
      infections: [0],
      fear_levels:[0],
      carryings:  [0],
      carrying_types: [0],
      pregnants:  [false],
      partner_ids: [null],
      attracted_tos: [null],
    })
    expect(expanded[0].id).toBe('a')
    expect(expanded[0].x).toBeCloseTo(10, 5)
    expect(expanded[0].vx).toBe(0)
    // ages was intentionally omitted from delta payloads. The
    // expanded record must not synthesise a fake 0 — that would
    // overwrite the cached real age on merge.
    expect('age' in expanded[0]).toBe(false)
  })

  it('honours ages when the SoA carries them', () => {
    const expanded = expandOrgsSoa({
      ids: ['b'],
      xs: [0], ys: [0], vxs: [0], vys: [0],
      energies: [0], hydrations: [0], healths: [0],
      ages: [1234],
      alives: [true],
      thoughts: [''],
      infections: [0], fear_levels: [0],
      carryings: [0], carrying_types: [0],
      pregnants: [false],
      partner_ids: [null], attracted_tos: [null],
    })
    expect(expanded[0].age).toBe(1234)
  })
})
