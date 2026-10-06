// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { SPRITE_UNTEXTURED, SpriteLayer, type LayerAtlas } from 'cubeforge'
import type { WorldState } from '../../../../shared/types'
import { TILE } from '../../../model/palette'
import { TILE_ID } from '../../../model/terrain-ids'
import { buildFoamRects } from '../../foam'
import { CellAtlas, type AtlasPageSlot } from '../atlas/cell-atlas'
import { makeFrame } from '../frame'
import { FoamDriver, PatchDriver, ShoreDriver, StructureDriver } from './ground-drivers'

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

const W = 16
const H = 12

/** Grass with a pond in the middle (water at columns 6 to 9, rows 4 to 7). */
function world(over: Partial<WorldState['grid']> = {}): WorldState {
  const tiles = Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) =>
      x >= 6 && x <= 9 && y >= 4 && y <= 7 ? TILE_ID.WATER : TILE_ID.GRASS,
    ),
  )
  const biomes = Array.from({ length: H }, () => Array(W).fill(0))
  return {
    grid: { width: W, height: H, origin_x: 0, origin_y: 0, tiles, biomes, ...over },
    frame_id: 1,
    tick: 100,
    is_day: true,
    day_progress: 0.4,
    organisms: [],
  } as unknown as WorldState
}

function frame(w: WorldState, revision: number, now = 1000) {
  return makeFrame(
    w,
    w.grid.biomes,
    { x: (W * TILE) / 2, y: (H * TILE) / 2, zoom: 2 },
    { w: 400, h: 300 },
    now,
    2,
    revision,
  )
}

function layer(): SpriteLayer {
  return new SpriteLayer({ atlases: [{ dynamicSrc: 'a' }, { dynamicSrc: 'b' }] })
}

describe('shore driver', () => {
  it('waits for a terrain revision, then draws a sprite per shore tile and reed', () => {
    const l = layer()
    const driver = new ShoreDriver(l, atlas())
    const w = world()
    expect(driver.update(frame(w, 0))).toBe(false)
    expect(l.count).toBe(0)
    expect(driver.update(frame(w, 1))).toBe(true)
    // The pond is 4 x 4: 12 water edge tiles and 16 land tiles around it carry shore marks.
    expect(l.count).toBeGreaterThanOrEqual(28)
    const reeds = driver.stats.reeds
    expect(l.count).toBeGreaterThanOrEqual(28 + reeds)
    for (let i = 0; i < l.count; i++) {
      expect(l.x[i]).toBeGreaterThan(0)
      expect(l.x[i]).toBeLessThan(W * TILE)
      expect(l.y[i]).toBeGreaterThan(0)
      expect(l.y[i]).toBeLessThan(H * TILE)
    }
  })

  it('rebuilds only when the revision changes', () => {
    const l = layer()
    const driver = new ShoreDriver(l, atlas())
    const w = world()
    driver.update(frame(w, 1))
    expect(driver.update(frame(w, 1))).toBe(false)
    expect(driver.update(frame(w, 2))).toBe(true)
    expect(driver.stats.rebuilds).toBe(2)
  })

  it('shares cells between tiles that look alike', () => {
    const a = atlas()
    const driver = new ShoreDriver(layer(), a)
    driver.update(frame(world(), 1))
    // A rectangular pond needs a handful of looks (edges and corners), not one per tile.
    expect(a.cellCount).toBeLessThan(20)
  })
})

describe('patch driver', () => {
  it('puts a sprite on each food and mineral tile', () => {
    const w = world()
    w.grid.tiles[1][1] = TILE_ID.FOOD
    w.grid.tiles[2][3] = TILE_ID.FOOD
    w.grid.tiles[9][12] = TILE_ID.MINERAL
    const l = layer()
    const driver = new PatchDriver(l, atlas())
    expect(driver.update(frame(w, 1))).toBe(true)
    expect(l.count).toBe(3)
    expect(l.x[2] - 1 + (TILE + 2) / 2).toBeGreaterThan(12 * TILE - 2)
    expect(driver.update(frame(w, 1))).toBe(false)
  })
})

describe('structure driver', () => {
  it('marks tiles with built-up structure, one sprite each, and follows the wire frame', () => {
    const structure = Array.from({ length: H }, () => Array(W).fill(0))
    structure[3][3] = 0.9
    structure[3][4] = 0.4
    structure[3][5] = 0.1
    structure[4][4] = 0.02
    const w = world({ structure })
    const l = layer()
    const driver = new StructureDriver(l, atlas())
    expect(driver.update(frame(w, 1))).toBe(true)
    expect(l.count).toBe(3)
    expect(driver.update(frame(w, 1))).toBe(false)
    structure[3][3] = 0
    expect(driver.update(frame({ ...w, frame_id: 2 }, 1))).toBe(true)
    expect(l.count).toBe(2)
  })

  it('leaves the layer alone when a new simulation frame brings the same structure', () => {
    const structure = Array.from({ length: H }, () => Array(W).fill(0))
    structure[3][3] = 0.9
    structure[5][7] = 0.5
    const l = layer()
    const driver = new StructureDriver(l, atlas())
    const w = world({ structure })
    expect(driver.update(frame(w, 1))).toBe(true)
    const before = {
      x: Array.from(l.x.slice(0, 2)),
      frame: Array.from(l.frame.slice(0, 2)),
      version: l.version,
    }
    // Every frame arrives with a new grid object holding the same numbers.
    const copy = structure.map((row) => [...row])
    expect(driver.update(frame({ ...w, frame_id: 2, grid: { ...w.grid, structure: copy } }, 1))).toBe(false)
    expect(driver.stats.rebuilds).toBe(1)
    expect(driver.stats.scans).toBe(2)
    expect(l.version).toBe(before.version)
    // A different strength on one tile does rebuild, with that tile's own cell.
    copy[5][7] = 0.9
    expect(driver.update(frame({ ...w, frame_id: 3, grid: { ...w.grid, structure: copy } }, 1))).toBe(true)
    expect(driver.stats.rebuilds).toBe(2)
    expect(Array.from(l.x.slice(0, 2))).toEqual(before.x)
    // Row-major: the first sprite is the tile at (3, 3), the second the one at (7, 5).
    expect(l.frame[0]).toBe(l.frame[1])
  })

  it('writes sprites at the tile each mark belongs to, in row order', () => {
    const structure = Array.from({ length: H }, () => Array(W).fill(0))
    structure[2][9] = 0.8
    structure[6][1] = 0.4
    const l = layer()
    new StructureDriver(l, atlas()).update(frame(world({ structure }), 1))
    expect(l.count).toBe(2)
    const cell = TILE + 2
    expect(l.x[0] + 0).toBe(9 * TILE - 1 + cell / 2)
    expect(l.y[0]).toBe(2 * TILE - 1 + cell / 2)
    expect(l.x[1]).toBe(1 * TILE - 1 + cell / 2)
    expect(l.y[1]).toBe(6 * TILE - 1 + cell / 2)
    expect(l.ids[1]).toBe(1)
  })

  it('clears when the grid has no structure', () => {
    const l = layer()
    const driver = new StructureDriver(l, atlas())
    const structure = Array.from({ length: H }, () => Array(W).fill(0.5))
    driver.update(frame(world({ structure }), 1))
    expect(l.count).toBe(W * H)
    driver.update(frame(world(), 1))
    expect(l.count).toBe(0)
  })
})

describe('foam driver', () => {
  it('lays untextured rectangles along the shore and pulses the thick breakers in four phases', () => {
    const w = world()
    const l = layer()
    const driver = new FoamDriver(l)
    expect(driver.update(frame(w, 1, 0))).toBe(true)
    const rects = buildFoamRects(w.grid.tiles, W, H)
    const expected = rects.thin.length / 4 + rects.thick.reduce((n, b) => n + b.length / 4, 0)
    expect(l.count).toBe(expected)
    expect(l.count).toBeGreaterThan(30)
    for (let i = 0; i < l.count; i++) expect(l.flags[i] & SPRITE_UNTEXTURED).toBeTruthy()
    const alphaAt = (i: number) => l.color[i] & 255
    const thin = rects.thin.length / 4
    // The thin line is a constant 30% white.
    expect(alphaAt(0)).toBe(Math.round(0.3 * 255))
    // Over one period the thick buckets are not all in the same phase.
    const seen = new Set<number>()
    for (let now = 0; now < 5000; now += 250) {
      driver.update(frame(w, 1, now))
      let start = thin
      for (const bucket of rects.thick) {
        if (bucket.length) seen.add(Math.round(alphaAt(start) / 16))
        start += bucket.length / 4
      }
    }
    expect(seen.size).toBeGreaterThan(2)
  })

  it('holds the same shape as the canvas foam: every shore edge has a thin line and a thick one', () => {
    const rects = buildFoamRects(world().grid.tiles, W, H)
    expect(rects.thin.length / 4).toBe(rects.thick.reduce((n, b) => n + b.length / 4, 0))
  })
})
