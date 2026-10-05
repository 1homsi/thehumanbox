// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TileLayerData } from 'cubeforge'
import { TILE } from '../../model/palette'
import { TILE_ID } from '../../model/terrain-ids'
import { terrainSeason } from '../terrain-season'
import { TERRAIN_VARIANTS } from './atlas'
import { createTerrainSyncState, syncTerrainLayer, terrainLod } from './sync'
import type { TerrainSource } from './sync'
import {
  TERRAIN_KINDS,
  VARIANTS,
  buildFlatTilesetPixels,
  kindHeadId,
  terrainKind,
  terrainTilesetPixels,
} from './tileset'

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

const W = 48
const H = 32

/** A small island world touching every ground kind: sea, shore sand, grass, rock, snow, ash, flood. */
function makeSource(season = 'abundance'): TerrainSource {
  const rand = rng(7)
  const tiles: number[][] = []
  const biomes: number[][] = []
  const depth: number[][] = []
  for (let row = 0; row < H; row++) {
    const t: number[] = []
    const b: number[] = []
    const d: number[] = []
    for (let col = 0; col < W; col++) {
      const dx = (col - W / 2) / (W / 2)
      const dy = (row - H / 2) / (H / 2)
      const r = Math.hypot(dx, dy)
      let tile: number = TILE_ID.WATER
      if (r < 0.9) tile = TILE_ID.SAND
      if (r < 0.75) tile = TILE_ID.GRASS
      if (r < 0.5 && dx > 0.1) tile = TILE_ID.ROCK
      if (r < 0.3 && dx > 0.2) tile = TILE_ID.SNOW
      if (r < 0.4 && dx < -0.2 && dy < 0) tile = TILE_ID.ASH
      if (tile === TILE_ID.GRASS && rand() < 0.05) tile = TILE_ID.FOOD
      if (tile === TILE_ID.GRASS && rand() < 0.02) tile = TILE_ID.FLOODED
      t.push(tile)
      b.push(Math.floor(rand() * 10))
      d.push(Math.floor(r * 180))
    }
    tiles.push(t)
    biomes.push(b)
    depth.push(d)
  }
  return { width: W, height: H, tiles, biomes, depth_map: depth, season }
}

function makeLayer() {
  return new TileLayerData({
    width: W,
    height: H,
    tileset: { tileWidth: TILE, tileHeight: TILE, columns: VARIANTS },
    variants: TERRAIN_VARIANTS,
    tinted: true,
    tileWorldWidth: TILE,
    tileWorldHeight: TILE,
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  terrainLod.enabled = true
})

describe('terrain tileset', () => {
  it('holds VARIANTS opaque patterns per kind, as factors a tint can only darken', () => {
    const px = terrainTilesetPixels()
    expect(px.width).toBe(VARIANTS * TILE)
    expect(px.height).toBe(TERRAIN_KINDS.length * TILE)
    for (let i = 0; i < px.data.length; i += 4) {
      expect(px.data[i + 3]).toBe(255)
      expect(px.data[i]).toBe(px.data[i + 1])
    }
    // The brightest texel of every kind is (nearly) full scale: the tint carries the colour.
    for (let kind = 0; kind < TERRAIN_KINDS.length; kind++) {
      let max = 0
      for (let y = kind * TILE; y < (kind + 1) * TILE; y++) {
        for (let x = 0; x < px.width; x++) max = Math.max(max, px.data[(y * px.width + x) * 4])
      }
      expect(max).toBe(255)
    }
  })

  it('flattens each kind to its mean for the far-zoom level of detail', () => {
    const flat = buildFlatTilesetPixels()
    const px = terrainTilesetPixels()
    for (let kind = 0; kind < TERRAIN_KINDS.length; kind++) {
      const o = (kind * TILE * flat.width + 5 * TILE + 3) * 4
      expect(flat.data[o]).toBe(Math.round(px.mean[kind] * 255))
      expect(flat.data[o]).toBe(flat.data[kind * TILE * flat.width * 4])
    }
  })
})

describe('TileLayer terrain sync', () => {
  it('writes a head id per kind and a tint for every tile', () => {
    const src = makeSource()
    const layer = makeLayer()
    const result = syncTerrainLayer(layer, createTerrainSyncState(), src)
    expect(result.kind).toBe('full')
    const heads = new Set(TERRAIN_KINDS.map((_, k) => kindHeadId(k)))
    for (let i = 0; i < layer.tiles.length; i++) expect(heads.has(layer.tiles[i])).toBe(true)
    // The flooded and food tiles use the water and grass kinds.
    expect(layer.tiles[0]).toBe(kindHeadId(terrainKind(TILE_ID.WATER)))
    expect(layer.tints!.some((v, i) => i % 4 === 3 && v !== 255)).toBe(false)
    expect(layer.tints!.some((v, i) => i % 4 !== 3 && v > 0)).toBe(true)
  })

  it('is a no-op for the same inputs and for an identical re-sent grid', () => {
    const src = makeSource()
    const layer = makeLayer()
    const state = createTerrainSyncState()
    syncTerrainLayer(layer, state, src)
    const rev = layer.revision
    expect(syncTerrainLayer(layer, state, src).kind).toBe('none')
    const copy = { ...src, tiles: src.tiles.map((r) => r.slice()) }
    expect(syncTerrainLayer(layer, state, copy).kind).toBe('none')
    expect(layer.revision).toBe(rev)
  })

  it('updates a few changed tiles in place and matches a fresh full sync', () => {
    const src = makeSource()
    const layer = makeLayer()
    const state = createTerrainSyncState()
    syncTerrainLayer(layer, state, src)
    const tiles = src.tiles.map((r) => r)
    const change = (row: number, col: number, tile: number) => {
      if (tiles[row] === src.tiles[row]) tiles[row] = src.tiles[row].slice()
      tiles[row][col] = tile
    }
    change(16, 24, TILE_ID.WATER) // grass becomes water beside land: shore mix of the neighbours changes
    change(10, 20, TILE_ID.ROCK)
    change(3, 3, TILE_ID.SAND)
    const next = { ...src, tiles }
    const result = syncTerrainLayer(layer, state, next)
    expect(result.kind).toBe('incremental')
    expect(result.tilesWritten).toBeGreaterThan(0)
    expect(result.tilesWritten).toBeLessThan(40)
    const fresh = makeLayer()
    syncTerrainLayer(fresh, createTerrainSyncState(), next)
    expect(Array.from(layer.tiles)).toEqual(Array.from(fresh.tiles))
    expect(Array.from(layer.tints!)).toEqual(Array.from(fresh.tints!))
  })

  it('marks only the touched chunks dirty on an incremental update', () => {
    const src = makeSource()
    const layer = makeLayer()
    const state = createTerrainSyncState()
    syncTerrainLayer(layer, state, src)
    layer.clearDirty()
    const tiles = src.tiles.map((r) => r)
    tiles[16] = src.tiles[16].slice()
    tiles[16][24] = TILE_ID.WATER
    syncTerrainLayer(layer, state, { ...src, tiles })
    expect(layer.dirtyCount).toBeGreaterThan(0)
    expect(layer.dirtyCount).toBeLessThanOrEqual(2)
  })

  it('rewrites everything when the season, the biomes or the depth map change', () => {
    const src = makeSource('abundance')
    const layer = makeLayer()
    const state = createTerrainSyncState()
    syncTerrainLayer(layer, state, src)
    const before = Array.from(layer.tints!)
    const winter = syncTerrainLayer(layer, state, { ...src, season: 'hard_winter' })
    expect(winter.kind).toBe('full')
    expect(Array.from(layer.tints!)).not.toEqual(before)
    const biomes = src.biomes!.map((r) => r.slice())
    expect(syncTerrainLayer(layer, state, { ...src, season: 'hard_winter', biomes }).kind).toBe('full')
    // A depth map with a new identity is a new colour input too.
    const depth_map = src.depth_map!.map((r) => r.slice())
    expect(syncTerrainLayer(layer, state, { ...src, season: 'hard_winter', biomes, depth_map }).kind).toBe(
      'full',
    )
  })

  it('ignores a grid that does not match the layer', () => {
    const layer = makeLayer()
    const src = makeSource()
    expect(syncTerrainLayer(layer, createTerrainSyncState(), { ...src, width: W + 1 }).kind).toBe('none')
    expect(syncTerrainLayer(layer, createTerrainSyncState(), { ...src, tiles: [] }).kind).toBe('none')
  })
})

describe('level of detail', () => {
  function stubDom() {
    vi.stubGlobal('ImageData', class {})
    vi.stubGlobal('document', {
      createElement: () => ({ getContext: () => ({ putImageData: () => undefined }) }),
    })
  }

  it('swaps in the flat tileset when tiles are a few device pixels wide, with hysteresis', () => {
    stubDom()
    vi.stubGlobal('devicePixelRatio', 2)
    const src = makeSource()
    const layer = makeLayer()
    const state = createTerrainSyncState()
    const detailed = layer.tileset
    syncTerrainLayer(layer, state, { ...src, zoom: 1 }) // 16 px per tile
    expect(state.flat).toBe(false)
    expect(layer.tileset).toBe(detailed)
    syncTerrainLayer(layer, state, { ...src, zoom: 0.2 }) // 3.2 px per tile
    expect(state.flat).toBe(true)
    const flat = layer.tileset
    expect(flat).not.toBe(detailed)
    syncTerrainLayer(layer, state, { ...src, zoom: 0.5 }) // 8 px: inside the hysteresis band
    expect(state.flat).toBe(true)
    expect(layer.tileset).toBe(flat)
    syncTerrainLayer(layer, state, { ...src, zoom: 0.6 }) // 9.6 px
    expect(state.flat).toBe(false)
  })

  it('can be switched off', () => {
    stubDom()
    vi.stubGlobal('devicePixelRatio', 2)
    terrainLod.enabled = false
    const layer = makeLayer()
    const state = createTerrainSyncState()
    syncTerrainLayer(layer, state, { ...makeSource(), zoom: 0.1 })
    expect(state.flat).toBe(false)
  })
})

describe('terrain season', () => {
  it('colours a hard winter differently from an ordinary scarcity', () => {
    expect(terrainSeason({ season: 'scarcity', hard_winter: true })).toBe('hard_winter')
    expect(terrainSeason({ season: 'scarcity', hard_winter: false })).toBe('scarcity')
    expect(terrainSeason({ season: 'decline', hard_winter: true })).toBe('decline')
  })
})
