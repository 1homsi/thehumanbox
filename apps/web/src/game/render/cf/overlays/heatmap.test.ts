// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import type { WorldState } from '../../../../shared/types'
import { HeatGrid, moodScore, wealthOf } from './heatmap'

const W = 24
const H = 16

function field(seed: number, scale: number): number[][] {
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      const v =
        Math.sin((x + seed) / scale) * Math.cos((y + seed * 2) / scale) + Math.sin((x + y) / (scale * 1.7))
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
        {
          lid: 'a',
          tiles: [
            [2, 2],
            [3, 2],
            [2, 3],
            [3, 3],
            [4, 3],
          ],
        },
        {
          lid: 'b',
          tiles: [
            [3, 3],
            [4, 3],
            [5, 3],
            [5, 4],
          ],
        },
      ],
      contested: [[3, 3]],
    },
    tribal_relations: [],
    tick: 10,
    frame_id: 1,
  } as unknown as WorldState
}

type Flags = { territory: boolean; fertility: boolean; hazard: boolean; trails: boolean }

const none: Flags = { territory: false, fertility: false, hazard: false, trails: false }

function shownTiles(overlay: string | null, flags: Flags): number {
  const world = makeWorld()
  const heat = new HeatGrid(W, H)
  return heat.compute(world, { overlay, viewFlags: flags, focus: 'all' }, world.viewport_organisms!)
}

describe('heat map', () => {
  it.each(['hazard', 'fertility', 'structures', 'trails', 'age', 'threat', 'density'])(
    'overlay %s tints tiles',
    (overlay) => {
      expect(shownTiles(overlay, none)).toBeGreaterThan(0)
    },
  )

  it('shows nothing with no overlay and no view flag', () => {
    const world = makeWorld()
    world.grid.path_trail = undefined
    const heat = new HeatGrid(W, H)
    expect(heat.compute(world, { overlay: null, viewFlags: none, focus: 'all' }, [])).toBe(0)
  })

  it('view flags, territory fills and the always-on worn paths add tints', () => {
    const all = shownTiles(null, { territory: true, fertility: true, hazard: true, trails: true })
    expect(all).toBeGreaterThan(50)
    expect(all).toBeGreaterThan(shownTiles(null, none))
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

describe('food, wealth and mood lenses', () => {
  it('food tints the cells that grow food, and nothing on bare grass', () => {
    const world = makeWorld()
    world.grid.food_trail = undefined
    world.grid.path_trail = undefined
    const bare = new HeatGrid(W, H)
    expect(bare.compute(world, { overlay: 'food', viewFlags: none, focus: 'all' }, [])).toBe(0)
    world.grid.tiles = Array.from({ length: H }, (_, y) =>
      Array.from({ length: W }, (_, x) => (x === 5 && y === 5 ? 3 : 1)),
    )
    const food = new HeatGrid(W, H)
    expect(food.compute(world, { overlay: 'food', viewFlags: none, focus: 'all' }, [])).toBe(1)
    expect(food.tiles[5 * W + 5]).toBe(1)
  })

  it('wealth tints where people carry goods and tools, and not where they hold nothing', () => {
    const world = makeWorld()
    const organisms = world.viewport_organisms!.map((o, i) => ({
      ...o,
      carrying: i % 2 === 0 ? 3 : 0,
      tools: { axe: 1 },
    }))
    const heat = new HeatGrid(W, H)
    expect(
      heat.compute(world, { overlay: 'wealth', viewFlags: none, focus: 'all' }, organisms),
    ).toBeGreaterThan(0)
    const bare = organisms.map((o) => ({ ...o, carrying: 0, tools: {} }))
    world.grid.path_trail = undefined
    const empty = new HeatGrid(W, H)
    expect(empty.compute(world, { overlay: 'wealth', viewFlags: none, focus: 'all' }, bare)).toBe(0)
  })

  it('mood tints the places where people are content or grieve', () => {
    const world = makeWorld()
    const moods = ['joyful', 'content', 'grieving', 'afraid']
    const organisms = world.viewport_organisms!.map((o, i) => ({ ...o, mood: moods[i % moods.length] }))
    const heat = new HeatGrid(W, H)
    expect(
      heat.compute(world, { overlay: 'mood', viewFlags: none, focus: 'all' }, organisms),
    ).toBeGreaterThan(0)
  })

  it('scores mood words and sums what a person holds', () => {
    expect(moodScore('joyful')).toBe(1)
    expect(moodScore('grieving')).toBe(-1)
    expect(moodScore('weird')).toBeNull()
    expect(moodScore(undefined)).toBeNull()
    expect(wealthOf({ carrying: 2, tools: { axe: 1, spear: 2 } })).toBe(5)
    expect(wealthOf({})).toBe(0)
  })
})
