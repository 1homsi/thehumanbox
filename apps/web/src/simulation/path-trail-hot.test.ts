// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { PATH_TRAIL_HOT, type GridWire } from '../shared/types'
import { HeatGrid } from '../game/render/cf/overlays/heatmap'
import type { WorldState } from '../shared/types'
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
  function heatOf(grid: ReturnType<typeof applyGridWire>): Uint8Array {
    const heat = new HeatGrid(grid.width, grid.height)
    const world = { grid, weather: undefined } as unknown as WorldState
    heat.compute(
      world,
      {
        overlay: null,
        viewFlags: { territory: false, fertility: false, hazard: false, trails: false },
        focus: 'all',
      },
      [],
    )
    return heat.rgba
  }

  it('tints the same tiles from the hot list as from a full scan', () => {
    for (const seed of [21, 22, 23]) {
      const grid = applyGridWire(wireWithTrails(seed, 60, 40, 3000), null)
      const scan = { ...grid, path_trail_hot: undefined }
      const fast = heatOf(grid)
      expect(fast).toEqual(heatOf(scan))
      expect(fast.some((v, i) => i % 4 === 3 && v > 0)).toBe(true)
    }
  })
})
