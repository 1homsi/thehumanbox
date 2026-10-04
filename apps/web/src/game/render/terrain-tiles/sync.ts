import type { TileLayerData } from 'cubeforge'
import { tileColor } from '../base-parts/tile-paint'
import { MAX_INCREMENTAL_TILES } from '../base-layer'
import { TILE } from '../../model/palette'
import { getFlatTerrainTileset, getTerrainTileset } from './atlas'
import { TERRAIN_KINDS, kindHeadId, terrainKind, terrainTilesetPixels } from './tileset'

/** What the terrain needs from a frame: the grid, its colour inputs and the season. */
export interface TerrainSource {
  width: number
  height: number
  tiles: number[][]
  biomes?: number[][]
  depth_map?: number[][]
  season?: string
  /** The camera zoom, for the level of detail. Omit to always show the textured tileset. */
  zoom?: number
}

/** What the layer currently shows, so the next frame can be diffed against it. */
export interface TerrainSyncState {
  tiles: number[][] | null
  biomes: number[][] | undefined
  depth_map: number[][] | undefined
  season: string | undefined
  width: number
  height: number
  /** Whether the flat far-zoom tileset is showing. */
  flat: boolean
}

export function createTerrainSyncState(): TerrainSyncState {
  return {
    tiles: null,
    biomes: undefined,
    depth_map: undefined,
    season: undefined,
    width: 0,
    height: 0,
    flat: false,
  }
}

/** Level of detail: below `flatBelowPx` device pixels per tile the flat tileset is shown. */
export const terrainLod = { enabled: true, flatBelowPx: 7, detailAbovePx: 9 }

function applyLod(layer: TileLayerData, state: TerrainSyncState, zoom: number | undefined) {
  const dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1
  const px = zoom === undefined ? Infinity : zoom * dpr * TILE
  const wantFlat =
    terrainLod.enabled && (state.flat ? px < terrainLod.detailAbovePx : px < terrainLod.flatBelowPx)
  if (wantFlat === state.flat) return
  state.flat = wantFlat
  layer.tileset = wantFlat ? getFlatTerrainTileset() : getTerrainTileset()
  layer.revision++
  layer.onChange?.()
}

export interface TerrainSyncResult {
  kind: 'none' | 'incremental' | 'full'
  /** Tiles whose id or tint was written. */
  tilesWritten: number
  ms: number
}

const scratch = new Int32Array(4)
let tintScales: number[] | null = null

/** Per kind: `(R + kmax) / R`, what the tint multiplies the colour by (see tileset.ts). */
function tintScale(kind: number): number {
  if (!tintScales) {
    const { kmax } = terrainTilesetPixels()
    tintScales = TERRAIN_KINDS.map((k, i) => (k.ref + kmax[i]) / k.ref)
  }
  return tintScales[kind]
}

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v)

/**
 * Compute tile (row, col): its TileLayer id and tint. Returns the id and leaves the tint in
 * `scratch[0..2]`. The colour comes from the canvas painter's own `tileColor`.
 */
function computeTile(src: TerrainSource, row: number, col: number): number {
  const tid = tileColor(scratch, src.tiles, src.biomes, src.depth_map, src.season, row, col)
  const kind = terrainKind(tid)
  const scale = tintScale(kind)
  const shading = scratch[3]
  scratch[0] = Math.min(255, Math.round(clamp255(scratch[0] + shading) * scale))
  scratch[1] = Math.min(255, Math.round(clamp255(scratch[1] + shading) * scale))
  scratch[2] = Math.min(255, Math.round(clamp255(scratch[2] + shading) * scale))
  return kindHeadId(kind)
}

function writeTile(layer: TileLayerData, src: TerrainSource, row: number, col: number): boolean {
  const id = computeTile(src, row, col)
  const tints = layer.tints!
  const o = (row * layer.width + col) * 4
  let changed = layer.setTile(col, row, id)
  if (tints[o] !== scratch[0] || tints[o + 1] !== scratch[1] || tints[o + 2] !== scratch[2]) {
    layer.setTint(col, row, ((scratch[0] << 24) | (scratch[1] << 16) | (scratch[2] << 8) | 255) >>> 0)
    changed = true
  }
  return changed
}

function writeAll(layer: TileLayerData, src: TerrainSource) {
  const { width, height } = layer
  const ids = layer.tiles
  const tints = layer.tints!
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const i = row * width + col
      ids[i] = computeTile(src, row, col)
      const o = i * 4
      tints[o] = scratch[0]
      tints[o + 1] = scratch[1]
      tints[o + 2] = scratch[2]
      tints[o + 3] = 255
    }
  }
  // The arrays were written in place; these copy them onto themselves and mark everything dirty.
  layer.setTiles(ids)
  layer.setTints(tints)
}

/**
 * Bring the TileLayer in line with the terrain: cached when nothing changed, an in-place update
 * of the changed tiles (and their four neighbours, whose shore mix depends on them) when a new
 * tiles grid differs in a handful of cells, and a full rewrite when the season, biomes, depth
 * map or size changed or too many tiles differ. The same policy as the canvas painter's
 * `getBaseLayerCanvas`.
 */
export function syncTerrainLayer(
  layer: TileLayerData,
  state: TerrainSyncState,
  src: TerrainSource,
): TerrainSyncResult {
  const start = performance.now()
  const { width, height, tiles } = src
  if (!tiles || tiles.length < height || layer.width !== width || layer.height !== height) {
    return { kind: 'none', tilesWritten: 0, ms: 0 }
  }
  if (!layer.tints) layer.enableTints()
  applyLod(layer, state, src.zoom)
  if (
    state.tiles === tiles &&
    state.biomes === src.biomes &&
    state.depth_map === src.depth_map &&
    state.season === src.season
  ) {
    return { kind: 'none', tilesWritten: 0, ms: 0 }
  }
  const sameInputs =
    state.tiles !== null &&
    state.width === width &&
    state.height === height &&
    state.biomes === src.biomes &&
    state.depth_map === src.depth_map &&
    state.season === src.season
  const finish = (kind: TerrainSyncResult['kind'], tilesWritten: number): TerrainSyncResult => {
    state.tiles = tiles
    state.biomes = src.biomes
    state.depth_map = src.depth_map
    state.season = src.season
    state.width = width
    state.height = height
    return { kind, tilesWritten, ms: performance.now() - start }
  }

  if (sameInputs) {
    const old = state.tiles!
    const changes: number[] = []
    let overflow = false
    for (let row = 0; row < height && !overflow; row++) {
      const oldRow = old[row]
      const newRow = tiles[row]
      if (oldRow === newRow) continue
      if (!oldRow || !newRow) {
        overflow = true
        break
      }
      for (let col = 0; col < width; col++) {
        if (oldRow[col] !== newRow[col]) {
          changes.push(row * width + col)
          if (changes.length > MAX_INCREMENTAL_TILES) {
            overflow = true
            break
          }
        }
      }
    }
    if (!overflow) {
      let written = 0
      for (const i of changes) {
        const row = (i / width) | 0
        const col = i - row * width
        if (writeTile(layer, src, row, col)) written++
        if (row > 0 && writeTile(layer, src, row - 1, col)) written++
        if (row + 1 < height && writeTile(layer, src, row + 1, col)) written++
        if (col > 0 && writeTile(layer, src, row, col - 1)) written++
        if (col + 1 < width && writeTile(layer, src, row, col + 1)) written++
      }
      return finish(changes.length > 0 ? 'incremental' : 'none', written)
    }
  }

  writeAll(layer, src)
  return finish('full', width * height)
}
