// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { SPRITE_UNTEXTURED, SpriteLayer, type LayerAtlas } from 'xipjs'
import type { WorldState } from '../../../../shared/types'
import { TILE } from '../../../model/palette'
import { TILE_ID } from '../../../model/terrain-ids'
import { buildFoamRects } from '../../foam'
import { OCEAN } from '../../art-palette'
import { permanentWaterLandEdgeMask } from '../../../model/terrain-visuals'
import { CellAtlas, type AtlasPageSlot } from '../atlas/cell-atlas'
import { makeFrame } from '../frame'
import { FoamDriver, PatchDriver, ShoreDriver, StructureDriver } from './ground-drivers'
import { SeaChartDriver } from './sea-chart-driver'

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

  it('does not even scan between frames while the grid keeps the same structure revision', () => {
    const structure = Array.from({ length: H }, () => Array(W).fill(0))
    structure[3][3] = 0.9
    const l = layer()
    const driver = new StructureDriver(l, atlas())
    const w = world({ structure, structure_revision: 1 })
    expect(driver.update(frame(w, 1))).toBe(true)
    expect(driver.update(frame({ ...w, frame_id: 2 }, 1))).toBe(false)
    expect(driver.stats.scans).toBe(1)
    structure[3][3] = 0.4
    expect(driver.update(frame({ ...w, frame_id: 3, grid: { ...w.grid, structure_revision: 2 } }, 1))).toBe(
      true,
    )
    expect(driver.stats.scans).toBe(2)
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
    const expected = rects.thick.reduce((n, b) => n + b.length / 4, 0)
    expect(l.count).toBe(expected)
    expect(l.count).toBeGreaterThan(15)
    for (let i = 0; i < l.count; i++) expect(l.flags[i] & SPRITE_UNTEXTURED).toBeTruthy()
    const alphaAt = (i: number) => l.color[i] & 255
    // The breakers are surf-coloured, never white.
    expect(l.color[0] >>> 8).toBe((OCEAN.surf[0] << 16) | (OCEAN.surf[1] << 8) | OCEAN.surf[2])
    // Over one period the thick buckets are not all in the same phase.
    const seen = new Set<number>()
    for (let now = 0; now < 5000; now += 250) {
      driver.update(frame(w, 1, now))
      let start = 0
      for (const bucket of rects.thick) {
        if (bucket.length) seen.add(Math.round(alphaAt(start) / 16))
        start += bucket.length / 4
      }
    }
    expect(seen.size).toBeGreaterThan(2)
  })

  it('puts one breaker on every shore edge', () => {
    const tiles = world().grid.tiles
    let edges = 0
    for (let row = 0; row < H; row++)
      for (let col = 0; col < W; col++) {
        const mask = permanentWaterLandEdgeMask(tiles, row, col)
        for (let bit = 1; bit <= 8; bit <<= 1) if (mask & bit) edges++
      }
    const rects = buildFoamRects(tiles, W, H)
    expect(rects.thick.reduce((n, b) => n + b.length / 4, 0)).toBe(edges)
  })
})

describe('sea chart driver', () => {
  /**
   * All sea, deep on the west and shallow on the east, with the depth map the frames carry. Big enough
   * that its middle lies past where the world's edge falls away to the abyss.
   */
  const SW = 80
  const SH = 60
  function sea(depthAt: (x: number) => number): WorldState {
    const tiles = Array.from({ length: SH }, () => Array(SW).fill(TILE_ID.WATER))
    const depth_map = Array.from({ length: SH }, () => Array.from({ length: SW }, (_, x) => depthAt(x)))
    return world({ tiles, depth_map, width: SW, height: SH })
  }

  it('lays one cell where two depth bands meet and none over a single band', () => {
    const l = layer()
    const driver = new SeaChartDriver(l, atlas())
    expect(
      driver.update(
        frame(
          sea((x) => (x < SW / 2 ? 100 : 160)),
          1,
        ),
      ),
    ).toBe(true)
    expect(l.count).toBeGreaterThan(0)
    // Abyss everywhere, the edge included (the edge falls to the abyss too): one band, nothing to draw.
    const flat = layer()
    new SeaChartDriver(flat, atlas()).update(
      frame(
        sea(() => 0),
        1,
      ),
    )
    expect(flat.count).toBe(0)
  })

  it('rebuilds when the terrain or the depth map changes, and keeps the depth of the last full frame', () => {
    const l = layer()
    const driver = new SeaChartDriver(l, atlas())
    const w = sea((x) => (x < 8 ? 100 : 160))
    expect(driver.update(frame(w, 1))).toBe(true)
    // A delta frame without a depth map changes nothing.
    const delta = { ...w, grid: { ...w.grid, depth_map: undefined } } as WorldState
    expect(driver.update(frame(delta, 1))).toBe(false)
    expect(
      driver.update(
        frame(
          sea((x) => (x < 4 ? 100 : 160)),
          1,
        ),
      ),
    ).toBe(true)
    expect(driver.update(frame(delta, 2))).toBe(true)
    expect(driver.stats.rebuilds).toBe(3)
  })
})
