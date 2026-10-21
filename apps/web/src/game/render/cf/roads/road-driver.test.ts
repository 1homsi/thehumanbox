// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { SpriteLayer, type LayerAtlas } from 'xipjs'
import type { WorldState } from '../../../../shared/types'
import { TILE } from '../../../model/palette'
import { TILE_ID } from '../../../model/terrain-ids'
import { CellAtlas, type AtlasPageSlot } from '../atlas/cell-atlas'
import { makeFrame } from '../frame'
import { TradePathPlanner } from '../../trade-paths'
import { ROAD_CLASSES, RoadDriver, resolveCell } from './road-driver'
import {
  ROAD_BRIDGE,
  ROAD_CANAL,
  ROAD_E,
  ROAD_N,
  ROAD_RAIL,
  ROAD_TRACK,
  ROAD_W,
  railCellKey,
  roadCellKey,
} from './road-art'

function permissive(): CanvasRenderingContext2D {
  return new Proxy({} as Record<string, unknown>, {
    get: (t, key: string) => t[key] ?? (() => undefined),
    set: (t, key: string, value) => ((t[key] = value), true),
  }) as unknown as CanvasRenderingContext2D
}

function atlas(): CellAtlas {
  const slot: AtlasPageSlot = {
    maxWidth: 512,
    maxHeight: 512,
    open: (width, height) => {
      const canvas = { width, height }
      return {
        id: `page${width}x${height}`,
        canvas,
        ctx: permissive(),
        resize: (w, h) => Object.assign(canvas, { width: w, height: h }),
        markDirty: () => undefined,
      }
    },
  }
  const atlases: LayerAtlas[] = []
  return new CellAtlas([slot], ROAD_CLASSES, atlases)
}

const W = 40
const H = 12

function world(over: Partial<WorldState> = {}, roads?: number[][]): WorldState {
  const tiles = Array.from({ length: H }, () => Array(W).fill(TILE_ID.GRASS))
  return {
    grid: { width: W, height: H, origin_x: 0, origin_y: 0, tiles, roads, road_revision: roads ? 1 : 0 },
    frame_id: 1,
    tick: 100,
    current_era: 'classical',
    trade_routes: [
      {
        id: 1,
        lineage_a: 'a',
        lineage_b: 'b',
        a_center: [3, 5],
        b_center: [36, 5],
        established_tick: 0,
        last_dispatch_tick: 0,
        deliveries: 0,
        volume: 0,
      },
    ],
    lineage_eras: [
      { lineage_id: 'a', era_name: 'industrial' },
      { lineage_id: 'b', era_name: 'stone' },
    ],
    buildings: [],
    ...over,
  } as unknown as WorldState
}

function frame(w: WorldState, revision = 1, showTrade = true) {
  return makeFrame(
    w,
    undefined,
    { x: (W * TILE) / 2, y: (H * TILE) / 2, zoom: 2 },
    { w: 800, h: 300 },
    1000,
    2,
    revision,
    showTrade,
  )
}

const layer = () => new SpriteLayer({ atlases: [{ dynamicSrc: 'a' }] })

/** The cells the layer draws, as `col,row`. */
function drawn(l: SpriteLayer): Set<string> {
  const out = new Set<string>()
  for (let i = 0; i < l.count; i++)
    out.add(`${Math.round((l.x[i]! - TILE / 2) / TILE)},${Math.round((l.y[i]! - TILE / 2) / TILE)}`)
  return out
}

describe('what a cell is drawn as', () => {
  const kindOf = (spec: number) => (spec >> 4) & 0xf
  const styleOf = (spec: number) => spec >> 8

  it('is no road where neither the simulation nor a plan put one', () => {
    expect(resolveCell(0, 0, 0)).toBe(-1)
  })

  it('keeps a simulated road in the era style, and paints a planned one in its own', () => {
    expect(styleOf(resolveCell(ROAD_TRACK, 0, 1))).toBe(1)
    // Planned code 3 is paved (style 2); it also wins over the era style on a village road it follows.
    expect(styleOf(resolveCell(0, 3, 0))).toBe(2)
    expect(styleOf(resolveCell(ROAD_TRACK, 3, 0))).toBe(2)
    expect(kindOf(resolveCell(0, 3, 0))).toBe(ROAD_TRACK)
  })

  it('draws a planned crossing of water as a bridge', () => {
    expect(kindOf(resolveCell(0, 1 | 4, 0))).toBe(ROAD_BRIDGE)
  })

  it('leaves simulated bridges, rails and canals as they are, and bridges a planned canal crossing', () => {
    expect(kindOf(resolveCell(ROAD_BRIDGE, 2, 0))).toBe(ROAD_BRIDGE)
    expect(kindOf(resolveCell(ROAD_RAIL, 0, 0))).toBe(ROAD_RAIL)
    expect(kindOf(resolveCell(ROAD_CANAL, 0, 0))).toBe(ROAD_CANAL)
    expect(kindOf(resolveCell(ROAD_CANAL, 1 | 4, 0))).toBe(ROAD_BRIDGE)
    // A level crossing is a road over the rails.
    expect(kindOf(resolveCell(ROAD_RAIL, 2, 0))).toBe(ROAD_TRACK)
  })
})

describe('road driver with planned trade routes', () => {
  it('draws the planned road as tiles, in the style of the tribes, joined end to end', () => {
    const l = layer()
    const a = atlas()
    const driver = new RoadDriver(l, a, new TradePathPlanner())
    const w = world()
    let guard = 0
    while (driver.update(frame(w)) || (driver.plan.pending > 0 && guard++ < 10)) {
      // Keep going until the route is planned.
    }
    expect(driver.plan.planned).toBe(1)
    expect(l.count).toBeGreaterThan(20)
    // Every cell is on row 5: open ground, so the road runs straight between the two centres.
    for (const cell of drawn(l)) expect(cell.endsWith(',5')).toBe(true)
    // The more advanced tribe (industrial) paved it; straight cells in the middle join east and west.
    expect(a.get(roadCellKey('paved', ROAD_E | ROAD_W))).toBeDefined()
    expect(a.get(roadCellKey('track', ROAD_E | ROAD_W))).toBeUndefined()
  })

  it('joins the village roads: they are one network with the same junction masks', () => {
    const roads = Array.from({ length: H }, () => Array(W).fill(0))
    // A village road leaving the route's start northwards, from the cell the road passes.
    for (let r = 2; r <= 5; r++) roads[r]![8] = ROAD_TRACK
    const l = layer()
    const a = atlas()
    const driver = new RoadDriver(l, a, new TradePathPlanner())
    const w = world({}, roads)
    for (let i = 0; i < 6; i++) driver.update(frame(w))
    const cells = drawn(l)
    expect(cells.has('8,2')).toBe(true)
    // Where the village road meets the trade road is a T: the cell joins west, east and north.
    expect(a.get(roadCellKey('paved', ROAD_N | ROAD_E | ROAD_W))).toBeDefined()
  })

  it('shows no planned road with the trade lens off, and draws them again with it on', () => {
    const l = layer()
    const driver = new RoadDriver(l, atlas(), new TradePathPlanner())
    const w = world()
    for (let i = 0; i < 6; i++) driver.update(frame(w))
    const withLens = l.count
    expect(withLens).toBeGreaterThan(0)
    driver.update(frame(w, 1, false))
    expect(l.count).toBe(0)
    driver.update(frame(w, 1, true))
    expect(l.count).toBe(withLens)
  })

  it('rebuilds only when the roads, the plan, the window or the era change', () => {
    const l = layer()
    const driver = new RoadDriver(l, atlas(), new TradePathPlanner())
    const w = world()
    for (let i = 0; i < 6; i++) driver.update(frame(w))
    const rebuilds = driver.stats.rebuilds
    expect(driver.update(frame(w))).toBe(false)
    expect(driver.stats.rebuilds).toBe(rebuilds)
    expect(driver.update(frame({ ...w, current_era: 'stone' }))).toBe(true)
  })

  it('still draws the simulation roads alone when there are no routes', () => {
    const roads = Array.from({ length: H }, () => Array(W).fill(0))
    roads[3]![4] = ROAD_TRACK
    roads[3]![5] = ROAD_TRACK
    const l = layer()
    const driver = new RoadDriver(l, atlas(), new TradePathPlanner())
    driver.update(frame(world({ trade_routes: [] }, roads)))
    expect(drawn(l)).toEqual(new Set(['4,3', '5,3']))
  })

  it('keeps the rail where a route crosses it: the crossing joins only its own road', () => {
    const roads = Array.from({ length: H }, () => Array(W).fill(0))
    for (let r = 0; r < H; r++) roads[r]![20] = ROAD_RAIL
    const l = layer()
    const a = atlas()
    const driver = new RoadDriver(l, a, new TradePathPlanner())
    const w = world({}, roads)
    for (let i = 0; i < 6; i++) driver.update(frame(w))
    const cells = drawn(l)
    expect(cells.has('20,5')).toBe(true)
    // The road runs east to west through it and the rail cells above and below keep running north to south.
    expect(a.get(roadCellKey('paved', ROAD_E | ROAD_W))).toBeDefined()
    expect(cells.has('20,4')).toBe(true)
    expect(cells.has('20,6')).toBe(true)
    expect(a.get(railCellKey(true))).toBeDefined()
    expect(a.get(railCellKey(false))).toBeUndefined()
  })
})
