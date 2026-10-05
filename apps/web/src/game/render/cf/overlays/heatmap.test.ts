// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import type { WorldState } from '../../../../shared/types'
import { TILE } from '../../../model/palette'
import { draw_overlays } from '../../layers/overlays'
import type { DrawFrame } from '../../layers/frame'
import { parseColor } from './color'
import { HeatGrid } from './heatmap'
import { recordingContext } from './test-support'

const W = 24
const H = 16

function field(seed: number, scale: number): number[][] {
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      const v = Math.sin((x + seed) / scale) * Math.cos((y + seed * 2) / scale) + Math.sin((x + y) / (scale * 1.7))
      return Math.max(0, Math.min(1, v * 0.5 + 0.4))
    }),
  )
}

function makeWorld(): WorldState {
  const organisms = Array.from({ length: 30 }, (_, i) => ({
    id: `o${i}`,
    alive: true,
    x: 3 + ((i * 5) % 18),
    y: 2 + ((i * 3) % 11),
    age: 200 + i * 90,
    fear_level: 0.2 + (i % 5) * 0.2,
  }))
  return {
    grid: {
      width: W,
      height: H,
      origin_x: 0,
      origin_y: 0,
      tiles: Array.from({ length: H }, () => Array(W).fill(1)),
      fire_intensity: field(1, 4),
      structure: field(2, 5),
      hazard: field(3, 6),
      fertility: field(4, 7),
      food_trail: field(5, 3),
      water_trail: field(6, 4),
      path_trail: field(7, 3),
    },
    organisms,
    viewport_organisms: organisms,
    weather: { kind: 'clear', intensity: 0 },
    territory: {
      claimed: [
        { lid: 'a', tiles: [[2, 2], [3, 2], [2, 3], [3, 3], [4, 3]] },
        { lid: 'b', tiles: [[3, 3], [4, 3], [5, 3], [5, 4]] },
      ],
      contested: [[3, 3]],
    },
    tribal_relations: [],
    tick: 10,
    frame_id: 1,
  } as unknown as WorldState
}

type Flags = { territory: boolean; fertility: boolean; hazard: boolean; trails: boolean }

/** What the canvas painter ends up with on each tile: its fill calls, composited source-over. */
function paintWithCanvas(world: WorldState, overlay: string | null, flags: Flags): Float64Array {
  const acc = new Float64Array(W * H * 4) // premultiplied r, g, b, a
  const ctx = recordingContext((x, y, w, h, style) => {
    // Skip anything that is not a whole-tile fill (outline strokes use 1px rects).
    if (Math.abs(w - TILE) > 1e-6 || Math.abs(h - TILE) > 1e-6) return
    const c = parseColor(style)
    const col = Math.round(x / TILE)
    const row = Math.round(y / TILE)
    if (col < 0 || col >= W || row < 0 || row >= H) return
    const i = (row * W + col) * 4
    const a = c.a
    acc[i] = c.r * a + acc[i] * (1 - a)
    acc[i + 1] = c.g * a + acc[i + 1] * (1 - a)
    acc[i + 2] = c.b * a + acc[i + 2] * (1 - a)
    acc[i + 3] = a + acc[i + 3] * (1 - a)
  })
  const f = {
    ctx,
    world,
    overlay,
    focus: 'all',
    viewFlags: { ...flags, structures: false, partners: false, history: false, grid: false },
    width: W,
    height: H,
    structure: world.grid.structure,
    food_trail: world.grid.food_trail,
    water_trail: world.grid.water_trail,
    path_trail: world.grid.path_trail,
    fertility: world.grid.fertility,
    hazard: world.grid.hazard,
    ox: 0,
    oy: 0,
    r0: 0,
    r1: H,
    c0: 0,
    c1: W,
    organisms: world.viewport_organisms,
    W: W * TILE,
    H: H * TILE,
    t: 0,
  } as unknown as DrawFrame
  draw_overlays(f)
  return acc
}

function compare(overlay: string | null, flags: Flags, tolerance = 1.5) {
  const world = makeWorld()
  const expected = paintWithCanvas(world, overlay, flags)
  const heat = new HeatGrid(W, H)
  const shown = heat.compute(world, { overlay, viewFlags: flags, focus: 'all' }, world.viewport_organisms!)
  let worst = 0
  let tilesWithColour = 0
  for (let i = 0; i < W * H; i++) {
    const a = expected[i * 4 + 3]
    const alpha = heat.rgba[i * 4 + 3] / 255
    if (a > 0.004) tilesWithColour++
    // Alpha, and the straight colour, within a few levels (the byte quantisation of the tint texture).
    worst = Math.max(worst, Math.abs(a - alpha) * 255)
    if (a > 0.05) {
      for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs(expected[i * 4 + k] / a - heat.rgba[i * 4 + k]))
    }
  }
  expect(worst).toBeLessThanOrEqual(tolerance)
  return { shown, tilesWithColour }
}

const none: Flags = { territory: false, fertility: false, hazard: false, trails: false }

describe('heat map matches the canvas overlay painter, tile by tile', () => {
  it.each(['hazard', 'fertility', 'structures', 'trails', 'age', 'threat', 'density'])(
    'overlay %s',
    (overlay) => {
      const { shown } = compare(overlay, none)
      expect(shown).toBeGreaterThan(0)
    },
  )

  it('view flags, territory fills and the always-on worn paths stack in the same order', () => {
    // A real canvas rounds each fill to 8 bits as it stacks them; the float accumulator does not.
    const { shown } = compare(null, { territory: true, fertility: true, hazard: true, trails: true }, 3)
    expect(shown).toBeGreaterThan(50)
  })

  it('marks only tinted tiles with the solid tile id', () => {
    const world = makeWorld()
    const heat = new HeatGrid(W, H)
    const shown = heat.compute(world, { overlay: 'hazard', viewFlags: none, focus: 'all' }, [])
    expect(heat.tiles.reduce((n, id) => n + (id === 1 ? 1 : 0), 0)).toBe(shown)
    expect(heat.tiles.every((id) => id === 0 || id === 1)).toBe(true)
  })

  it('clamps channels that sum past 255 instead of wrapping (the trails overlay can)', () => {
    const world = makeWorld()
    world.grid.food_trail = Array.from({ length: H }, () => Array(W).fill(1))
    world.grid.water_trail = Array.from({ length: H }, () => Array(W).fill(1))
    world.grid.path_trail = Array.from({ length: H }, () => Array(W).fill(1))
    const heat = new HeatGrid(W, H)
    heat.compute(world, { overlay: 'trails', viewFlags: none, focus: 'all' }, [])
    // 255 + 70 + 40 red is clamped, not wrapped to 109.
    expect(heat.rgba[0]).toBeGreaterThan(200)
  })

  it('lists contested tiles for the pulsing layer', () => {
    const world = makeWorld()
    const heat = new HeatGrid(W, H)
    const out = new Uint16Array(W * H)
    expect(heat.contestedTiles(world, 0, 0, out)).toBe(1)
    expect(out[3 * W + 3]).toBe(1)
  })
})
