// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { PATH_TRAIL_HOT, type GridWire } from '../shared/types'
import { draw_overlays } from '../game/render/layers/overlays'
import type { DrawFrame } from '../game/render/layers/frame'
import { applyGridWire } from './wire'

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

function wireWithTrails(seed: number, w: number, h: number, count: number): GridWire {
  const rand = rng(seed)
  const trails: Array<[number, number, number, number, number]> = []
  for (let i = 0; i < count; i++) {
    // Some entries repeat a cell, some fall outside the grid, values straddle the threshold.
    const row = Math.floor(rand() * (h + 2))
    const col = Math.floor(rand() * (w + 2))
    trails.push([row, col, Math.floor(rand() * 100), Math.floor(rand() * 100), (i * 37 + seed) % 101])
  }
  return { width: w, height: h, origin_x: 0, origin_y: 0, fire: [], structure: [], trails }
}

function bruteForceHot(path: number[][]): number[] {
  const out: number[] = []
  for (let row = 0; row < path.length; row++) {
    for (let col = 0; col < path[row].length; col++) if (path[row][col] >= PATH_TRAIL_HOT) out.push(row, col)
  }
  return out
}

describe('path_trail_hot', () => {
  it('lists every busy path cell, row-major, with no duplicates', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const grid = applyGridWire(wireWithTrails(seed, 37, 23, 600), null)
      const hot = grid.path_trail_hot!
      expect(hot).toBeInstanceOf(Int32Array)
      // Every cell above the threshold is listed (the list may hold a few extra that were
      // overwritten by a later entry for the same cell, so re-check values like the renderer).
      const listed = new Set<number>()
      for (let i = 0; i < hot.length; i += 2) listed.add(hot[i] * 1000 + hot[i + 1])
      expect(listed.size).toBe(hot.length / 2)
      const expected = bruteForceHot(grid.path_trail!)
      for (let i = 0; i < expected.length; i += 2)
        expect(listed.has(expected[i] * 1000 + expected[i + 1])).toBe(true)
      for (let i = 2; i < hot.length; i += 2) {
        const before = hot[i - 2] * 1000 + hot[i - 1]
        const now = hot[i] * 1000 + hot[i + 1]
        expect(now).toBeGreaterThan(before)
      }
    }
  })

  it('follows the trail arrays: rebuilt with new trails, kept when a frame has none', () => {
    const first = applyGridWire(wireWithTrails(9, 20, 20, 300), null)
    const keep: GridWire = { width: 20, height: 20, origin_x: 0, origin_y: 0, fire: [], structure: [] }
    const carried = applyGridWire(keep, first)
    expect(carried.path_trail).toBe(first.path_trail)
    expect(carried.path_trail_hot).toBe(first.path_trail_hot)
    const next = applyGridWire(wireWithTrails(10, 20, 20, 300), carried)
    const expected = bruteForceHot(next.path_trail!)
    const listed = new Set<number>()
    for (let i = 0; i < next.path_trail_hot!.length; i += 2)
      listed.add(next.path_trail_hot![i] * 1000 + next.path_trail_hot![i + 1])
    for (let i = 0; i < expected.length; i += 2)
      expect(listed.has(expected[i] * 1000 + expected[i + 1])).toBe(true)
  })
})

describe('worn-path overlay', () => {
  // Records the fillStyle/fillRect pairs the overlay pass issues.
  function record(
    grid: ReturnType<typeof applyGridWire>,
    win: { r0: number; r1: number; c0: number; c1: number },
  ) {
    const out: string[] = []
    let style = ''
    const ctx = {
      save() {},
      restore() {},
      set fillStyle(v: string) {
        style = v
      },
      get fillStyle() {
        return style
      },
      fillRect: (x: number, y: number, w: number, h: number) => out.push(`${style}|${x},${y},${w},${h}`),
    }
    const world = { grid, weather: undefined } as unknown as DrawFrame['world']
    const frame = {
      ctx,
      world,
      selectedOrgId: null,
      overlay: null,
      focus: 'all',
      viewFlags: {},
      width: grid.width,
      height: grid.height,
      structure: grid.structure,
      food_trail: grid.food_trail,
      water_trail: grid.water_trail,
      path_trail: grid.path_trail,
      fertility: grid.fertility,
      hazard: grid.hazard,
      ox: 0,
      oy: 0,
      ...win,
      organisms: [],
      W: grid.width * 8,
      H: grid.height * 8,
      t: 1234,
    } as unknown as DrawFrame
    draw_overlays(frame)
    return out
  }

  it('draws the same tiles in the same order from the hot list as from a full scan', () => {
    for (const seed of [21, 22, 23]) {
      const grid = applyGridWire(wireWithTrails(seed, 60, 40, 3000), null)
      const scan = { ...grid, path_trail_hot: undefined }
      for (const win of [
        { r0: 0, r1: 40, c0: 0, c1: 60 },
        { r0: 5, r1: 30, c0: 11, c1: 47 },
        { r0: 17, r1: 18, c0: 0, c1: 60 },
        { r0: 0, r1: 40, c0: 59, c1: 60 },
      ]) {
        const fast = record(grid, win)
        expect(fast).toEqual(record(scan, win))
        if (win.c1 - win.c0 > 30 && win.r1 - win.r0 > 20) expect(fast.length).toBeGreaterThan(10)
      }
    }
  })
})
