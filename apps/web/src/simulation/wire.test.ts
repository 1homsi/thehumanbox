import { describe, it, expect } from 'vitest'
import { applyGridWire } from './wire'
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
})
