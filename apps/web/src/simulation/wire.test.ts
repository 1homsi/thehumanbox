import { describe, it, expect } from 'vitest'
import { applyGridWire, cellRows, expandDiscoveryNames, expandOrgsSoa } from './wire'
import type { GridWire } from '../shared/types'

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

  it('keeps the structure layer when a frame leaves it out, and counts each one it does carry', () => {
    const w1 = emptyWire(3, 2)
    w1.structure = [[1, 2, 60]]
    const first = applyGridWire(w1, null)
    expect(first.structure[1][2]).toBeCloseTo(0.6, 5)
    expect(first.structure_revision).toBe(1)

    const hot = emptyWire(3, 2)
    delete hot.structure
    const second = applyGridWire(hot, first)
    expect(second.structure).toBe(first.structure)
    expect(second.structure[1][2]).toBeCloseTo(0.6, 5)
    expect(second.structure_revision).toBe(1)

    const w3 = emptyWire(3, 2)
    w3.structure = [[0, 0, 100]]
    const third = applyGridWire(w3, second)
    expect(third.structure[1][2]).toBe(0)
    expect(third.structure[0][0]).toBe(1)
    expect(third.structure_revision).toBe(2)
  })

  it('builds an empty structure layer when the first frame leaves it out', () => {
    const wire = emptyWire(3, 2)
    delete wire.structure
    const grid = applyGridWire(wire, null)
    expect(grid.structure).toEqual([
      [0, 0, 0],
      [0, 0, 0],
    ])
  })

  it('applies sparse structure changes and skips empty deltas', () => {
    const full = emptyWire(3, 2)
    full.structure = [[1, 2, 60]]
    const first = applyGridWire(full, null)

    const delta = emptyWire(3, 2)
    delete delta.structure
    delta.structure_delta = [
      [1, 2, 20],
      [0, 0, 70],
    ]
    const second = applyGridWire(delta, first)
    expect(second.structure).toBe(first.structure)
    expect(second.structure[1][2]).toBeCloseTo(0.2, 5)
    expect(second.structure[0][0]).toBeCloseTo(0.7, 5)
    expect(second.structure_revision).toBe(2)

    const unchanged = emptyWire(3, 2)
    delete unchanged.structure
    unchanged.structure_delta = []
    const third = applyGridWire(unchanged, second)
    expect(third.structure).toBe(second.structure)
    expect(third.structure_revision).toBe(2)

    const clear = emptyWire(3, 2)
    delete clear.structure
    clear.structure_delta = [[1, 2, 0]]
    const fourth = applyGridWire(clear, third)
    expect(fourth.structure[1][2]).toBe(0)
    expect(fourth.structure_revision).toBe(3)
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
    // partner/attraction are sparse "absent -> unset": an empty list clears
    // the cached value rather than leaving it unchanged.
    expect(expanded[0].partner_id).toBeNull()
    expect(expanded[0].attracted_to).toBeNull()
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
    // Sparse: indexes absent from the list are unpartnered, an explicit clear.
    expect(expanded[1].partner_id).toBeNull()
    expect(expanded[2].partner_id).toBeNull()
    expect(expanded[1].thought).toBe('wandering')
    expect(expanded[0].attracted_to).toBeNull()
    expect(expanded[2].attracted_to).toBe('a')
  })
})

describe('expandDiscoveryNames', () => {
  it("turns each person's discovery indices back into names, and drops the table", () => {
    const frame: Record<string, unknown> = {
      discovery_names: ['fire', 'foraging', 'pottery'],
      organisms: [{ id: 'a', discoveries: [0, 2] }, { id: 'b', discoveries: [1, 0, 9] }, { id: 'c' }],
    }
    expandDiscoveryNames(frame)
    expect(frame.discovery_names).toBeUndefined()
    const orgs = frame.organisms as { discoveries?: string[] }[]
    expect(orgs[0]!.discoveries).toEqual(['fire', 'pottery'])
    // An index outside the table is left out, not shown as a number.
    expect(orgs[1]!.discoveries).toEqual(['foraging', 'fire'])
    expect(orgs[2]!.discoveries).toBeUndefined()
  })

  it('does the same for attributes', () => {
    const frame: Record<string, unknown> = {
      attribute_names: ['tall', 'calm'],
      organisms: [{ id: 'a', attributes: [1, 0] }],
    }
    expandDiscoveryNames(frame)
    expect(frame.attribute_names).toBeUndefined()
    expect((frame.organisms as { attributes: string[] }[])[0]!.attributes).toEqual(['calm', 'tall'])
  })

  it('leaves a frame without a table, or with names already, as it is', () => {
    const frame: Record<string, unknown> = { organisms: [{ id: 'a', discoveries: ['fire'] }] }
    expandDiscoveryNames(frame)
    expect((frame.organisms as { discoveries: string[] }[])[0]!.discoveries).toEqual(['fire'])
  })
})

describe('cellRows', () => {
  it('splits frame bytes into rows read as signed tile ids, copied off the frame buffer', () => {
    const frame = new Uint8Array([9, 9, 1, 2, 0xff, 4, 5, 0x80, 9])
    const layer = frame.subarray(2, 8)
    const rows = cellRows(layer, 3, 2, true)!
    expect(rows.map((r) => Array.from(r))).toEqual([
      [1, 2, -1],
      [4, 5, -128],
    ])
    frame[2] = 7
    expect(rows[0][0]).toBe(1)
  })

  it('reads unsigned bytes and plain JSON numbers alike, and refuses a short layer', () => {
    expect(cellRows(new Uint8Array([200, 1, 2, 3]), 2, 2, false)!.map((r) => Array.from(r))).toEqual([
      [200, 1],
      [2, 3],
    ])
    expect(cellRows([1, 2, 3, 4], 2, 2, false)).toEqual([
      [1, 2],
      [3, 4],
    ])
    expect(cellRows([1, 2, 3], 2, 2, false)).toBeUndefined()
  })

  it('keeps the held tiles when a frame carries none', () => {
    const base: GridWire = {
      width: 2,
      height: 1,
      origin_x: 0,
      origin_y: 0,
      fire: [],
      tiles: new Uint8Array([1, 2]),
    }
    const first = applyGridWire(base, null)
    const next = applyGridWire({ ...base, tiles: undefined }, first)
    expect(next.tiles).toBe(first.tiles)
    expect(Array.from(next.tiles[0])).toEqual([1, 2])
  })
})
