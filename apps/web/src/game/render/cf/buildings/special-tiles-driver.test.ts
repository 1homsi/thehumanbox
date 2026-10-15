// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { SpriteLayer, type LayerAtlas } from 'xipjs'
import type { WorldState } from '../../../../shared/types'
import { TILE } from '../../../model/palette'
import { TILE_ID } from '../../../model/terrain-ids'
import { CellAtlas, type AtlasPageSlot } from '../atlas/cell-atlas'
import { makeFrame } from '../frame'
import { GLOW_CLASSES, PROP_CLASSES, SpecialTilesDriver } from './special-tiles-driver'

/** A canvas context that accepts every call: baking only needs to run the painters. */
function permissive(): CanvasRenderingContext2D {
  return new Proxy({} as Record<string, unknown>, {
    get: (t, key: string) =>
      t[key] ??
      (key === 'createRadialGradient' ? () => ({ addColorStop: () => undefined }) : () => undefined),
    set: (t, key: string, value) => ((t[key] = value), true),
  }) as unknown as CanvasRenderingContext2D
}

function atlas(classes: ReadonlyArray<readonly [number, number]>): CellAtlas {
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
  return new CellAtlas([slot(), slot(), slot()], classes, atlases)
}

const W = 16
const H = 12

function world(isDay: boolean, fire = 0.6): WorldState {
  const tiles = Array.from({ length: H }, () => Array<number>(W).fill(TILE_ID.GRASS))
  tiles[5][5] = TILE_ID.CAMPFIRE
  tiles[7][9] = TILE_ID.FIRE
  tiles[3][3] = TILE_ID.HUT
  const fire_intensity = Array.from({ length: H }, () => Array<number>(W).fill(0))
  fire_intensity[5][5] = fire
  fire_intensity[7][9] = fire
  return {
    grid: { width: W, height: H, origin_x: 0, origin_y: 0, tiles, fire_intensity },
    frame_id: 1,
    tick: 100,
    is_day: isDay,
    day_progress: isDay ? 0.5 : 0.1,
    buildings: [],
    organisms: [],
  } as unknown as WorldState
}

function frame(w: WorldState, now: number) {
  return makeFrame(
    w,
    undefined,
    { x: (W * TILE) / 2, y: (H * TILE) / 2, zoom: 2 },
    { w: 400, h: 300 },
    now,
    2,
    1,
  )
}

function driver() {
  const layer = () =>
    new SpriteLayer({ atlases: [{ dynamicSrc: 'a' }, { dynamicSrc: 'b' }, { dynamicSrc: 'c' }] })
  return new SpecialTilesDriver(layer(), atlas(PROP_CLASSES), layer(), atlas(GLOW_CLASSES))
}

describe('special tiles driver', () => {
  it('draws the fires and huts, and by day rewrites them only when something changed', () => {
    const d = driver()
    const w = world(true)
    // 1020 ms is the start of an animation step (170 ms each).
    expect(d.update(frame(w, 1020))).toBe(true)
    expect(d.stats.fires).toBe(2)
    expect(d.update(frame(w, 1053))).toBe(false)
    expect(d.update(frame(w, 1086))).toBe(false)
    expect(d.stats.updates).toBe(1)
    // The fires reach their next animation frame.
    expect(d.update(frame(w, 1190))).toBe(true)
    expect(d.stats.updates).toBe(2)
  })

  it('rewrites by day when a fire changes strength, the tiles change, or the view moves', () => {
    const d = driver()
    const w = world(true)
    d.update(frame(w, 1020))
    w.grid.fire_intensity![5][5] = 0.2
    expect(d.update(frame(w, 1053))).toBe(true)
    expect(d.update(frame(w, 1053))).toBe(false)
    w.grid.tiles = w.grid.tiles.map((row) => row.slice())
    expect(d.update(frame(w, 1053))).toBe(true)
    const moved = makeFrame(w, undefined, { x: 40, y: 40, zoom: 2 }, { w: 40, h: 40 }, 1053, 2, 1)
    expect(d.update(moved)).toBe(true)
  })

  it('rewrites every step by night, when the fires flicker and the huts smoke', () => {
    const d = driver()
    const w = world(false)
    expect(d.update(frame(w, 1000))).toBe(true)
    expect(d.update(frame(w, 1053))).toBe(true)
    expect(d.update(frame(w, 1066))).toBe(true)
    expect(d.stats.updates).toBe(3)
  })

  it('rewrites when the day ends, even if the inputs match', () => {
    const d = driver()
    const w = world(false)
    d.update(frame(w, 1000))
    w.is_day = true
    expect(d.update(frame(w, 1010))).toBe(true)
  })
})
