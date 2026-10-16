// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { SpriteLayer, type LayerAtlas } from 'xipjs'
import type { Building, WorldState } from '../../../../shared/types'
import { TILE } from '../../../model/palette'
import { TILE_ID } from '../../../model/terrain-ids'
import { CellAtlas, type AtlasPageSlot } from '../atlas/cell-atlas'
import { makeFrame, type CfFrame } from '../frame'
import { BuildingsDriver } from './buildings-driver'

/** A canvas context that accepts every call: baking only needs to run the painters. */
function permissive(): CanvasRenderingContext2D {
  return new Proxy({} as Record<string, unknown>, {
    get: (t, key: string) => t[key] ?? (() => undefined),
    set: (t, key: string, value) => ((t[key] = value), true),
  }) as unknown as CanvasRenderingContext2D
}

function atlas(): CellAtlas {
  const slot = (): AtlasPageSlot => ({
    maxWidth: 256,
    maxHeight: 256,
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
  })
  const atlases: LayerAtlas[] = []
  return new CellAtlas(
    [slot(), slot()],
    [
      [TILE + 2, TILE + 2],
      [TILE + 6, TILE + 6],
    ],
    atlases,
  )
}

function layer(): SpriteLayer {
  return new SpriteLayer({ atlases: [{ dynamicSrc: 'a' }, { dynamicSrc: 'b' }] })
}

const W = 16
const H = 12

/** A stable `lineage_eras` object: the client reuses the previous one until the sim sends new eras. */
const ERAS: Record<string, string> = {}

const house = (over: Partial<Building> = {}): Building => ({
  id: 1,
  kind: 'house',
  x: 8,
  y: 6,
  condition: 1,
  damage: 0,
  integrity: 1,
  ...over,
})

/**
 * A world that keeps its own building list by reference (like the merged client world, which reuses
 * the previous array until the sim sends a new one). `tick` and `frame_id` advance on every call.
 */
function world(buildings: Building[], over: { tick?: number; frame_id?: number } = {}): WorldState {
  return {
    grid: {
      width: W,
      height: H,
      origin_x: 0,
      origin_y: 0,
      tiles: Array.from({ length: H }, () => Array(W).fill(TILE_ID.GRASS)),
      biomes: Array.from({ length: H }, () => Array(W).fill(0)),
    },
    frame_id: over.frame_id ?? 1,
    tick: over.tick ?? 100,
    is_day: true,
    day_progress: 0.4,
    buildings,
    lineage_eras: ERAS,
    organisms: [],
  } as unknown as WorldState
}

function frame(
  w: WorldState,
  over: { now?: number; revision?: number; zoom?: number } = {},
): CfFrame {
  return makeFrame(
    w,
    w.grid.biomes,
    { x: (W * TILE) / 2, y: (H * TILE) / 2, zoom: over.zoom ?? 2 },
    { w: 400, h: 300 },
    over.now ?? 1000,
    2,
    over.revision ?? 0,
  )
}

function driver(): { d: BuildingsDriver; atlas: CellAtlas } {
  const a = atlas()
  return { d: new BuildingsDriver(layer(), a, layer()), atlas: a }
}

describe('BuildingsDriver frame skipping', () => {
  it('skips a frame that only advanced the frame id and the tick', () => {
    const buildings = [house()]
    const { d } = driver()
    expect(d.update(frame(world(buildings)))).toBe(true)
    // Same list, same look, one frame on: the map must not rebuild every building.
    expect(d.update(frame(world(buildings, { tick: 101, frame_id: 2 })))).toBe(false)
    expect(d.stats.skipped).toBe(1)
    expect(d.stats.updates).toBe(1)
  })

  it('rebuilds when the sim sends a new building list', () => {
    const { d } = driver()
    expect(d.update(frame(world([house()])))).toBe(true)
    const next = [house(), house({ id: 2, x: 9 })]
    expect(d.update(frame(world(next, { tick: 200, frame_id: 3 })))).toBe(true)
  })

  it('rebuilds for a same-length list whose building data changed', () => {
    const { d } = driver()
    expect(d.update(frame(world([house()])))).toBe(true)
    // Same length, same everything else, but the house is now damaged: a new array must be re-keyed.
    expect(d.update(frame(world([house({ integrity: 0.4, damage: 0.6 })])))).toBe(true)
  })

  it('rebuilds when a ruin crosses an age bucket, and stays put between buckets', () => {
    const ruin = house({ id: 7, ruined: true, ruined_at_tick: 0, damage: 1, integrity: 0 })
    const buildings = [ruin]
    const { d } = driver()
    expect(d.update(frame(world(buildings, { tick: 100 })))).toBe(true)
    // Still the round(tick/1000) = 0 age bucket: skipped even though the tick moved.
    expect(d.update(frame(world(buildings, { tick: 400, frame_id: 2 })))).toBe(false)
    // 11_000 ticks of crumble is a later age bucket, so the cell must be re-baked.
    expect(d.update(frame(world(buildings, { tick: 11_000, frame_id: 3 })))).toBe(true)
  })

  it('rebuilds when a spaceport pad empties on the launch clock', () => {
    // (2400 * 7919) % 2400 = 0, so this pad is empty while the tick is under 780.
    const port = house({ id: 2400, kind: 'spaceport' })
    const buildings = [port]
    const { d } = driver()
    expect(d.update(frame(world(buildings, { tick: 0 })))).toBe(true)
    expect(d.update(frame(world(buildings, { tick: 100, frame_id: 2 })))).toBe(false)
    expect(d.update(frame(world(buildings, { tick: 780, frame_id: 3 })))).toBe(true)
  })

  it('rebuilds when the night bucket, detail, window or terrain changes (one at a time)', () => {
    const buildings = [house()]
    // Each dimension gets its own driver and a baseline skip, so a pass cannot come from another change.
    const changes = (mutation: (f: CfFrame, w: WorldState) => void) => {
      const { d } = driver()
      expect(d.update(frame(world(buildings)))).toBe(true)
      expect(d.update(frame(world(buildings, { frame_id: 2 })))).toBe(false)
      const w = world(buildings, { frame_id: 3 })
      const f = frame(w)
      mutation(f, w)
      expect(d.update(f)).toBe(true)
    }
    changes((f) => {
      f.win = { ...f.win, c0: f.win.c0 + 1 }
    })
    changes((f) => {
      f.detail = 'overview'
    })
    changes((_f, w) => {
      const night = w as unknown as { is_day: boolean; day_progress: number }
      night.is_day = false
      night.day_progress = 0.55
    })
    changes((f) => {
      f.terrainRevision = 3
    })
    changes((f) => {
      f.world.lineage_eras = { a: 'bronze' }
    })
    changes((_f, w) => {
      // The ground turns to winter, so a house's roof changes.
      ;(w as unknown as { season: string }).season = 'scarcity'
    })
  })

  it('skips when a winter frame is repeated', () => {
    const buildings = [house()]
    const { d } = driver()
    const w = world(buildings)
    const winter = w as unknown as { season: string; is_day: boolean; day_progress: number }
    winter.season = 'scarcity'
    winter.is_day = false
    winter.day_progress = 0.2
    expect(d.update(frame(w))).toBe(true)
    expect(d.update(frame(w, { now: 1001 }))).toBe(false)
  })

  it('rebuilds when the list empties and refills', () => {
    const buildings = [house()]
    const { d } = driver()
    expect(d.update(frame(world(buildings)))).toBe(true)
    expect(d.update(frame(world([], { frame_id: 2 })))).toBe(true)
    expect(d.update(frame(world(buildings, { frame_id: 3 })))).toBe(true)
  })
})
