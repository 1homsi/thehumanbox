import { drawFoodPatch, drawMineralOutcrop, visualTileHash } from './draw-helpers'
import { drawMountains } from './mountains'
import type { WorldState } from '../../shared/types'
import { ATLAS_TOWN, onAnyAtlasLoaded } from '../../shared/sprites'
import { TILE_ID } from '../model/terrain-ids'
import { permanentWaterDepth, terrainVisualSignature } from '../model/terrain-visuals'
import { TILE } from '../model/palette'
import { drawTrees, drawNaturalDecor } from './decorations'
import { paintTileBlock } from './base-parts/tile-paint'
import { buildFoamPaths } from './base-parts/terrain-scans'
import { cfOwns } from './cf/ownership'
import type { FoamPaths } from './base-parts/terrain-scans'

// The terrain base layer's cache and builders live here; noise, tile painting, terrain scans
// and the trade network are in ./base-parts and re-exported so importers keep one entry point.
export * from './base-parts/noise'
export * from './base-parts/tile-paint'
export * from './base-parts/terrain-scans'
export * from './base-parts/trade-network'

export let _imgBuf: ImageData | null = null
export let _baseCanvas: HTMLCanvasElement | null = null

export interface BaseLayerKey {
  width: number
  height: number
  origin_x: number
  origin_y: number
  tiles: number[][]
  terrain_signature: number
  biomes?: number[][]
  depth_map?: number[][]
  season?: string
  foam?: FoamPaths
}
export let _baseKey: BaseLayerKey | null = null

onAnyAtlasLoaded(() => {
  _baseKey = null
})
export function getReuseImgData(w: number, h: number): ImageData {
  if (!_imgBuf || _imgBuf.width !== w || _imgBuf.height !== h) {
    _imgBuf = new ImageData(w, h)
  }
  return _imgBuf
}

export function baseLayerMatches(
  key: typeof _baseKey,
  width: number,
  height: number,
  origin_x: number,
  origin_y: number,
  tiles: number[][],
  terrain_signature: number,
  biomes?: number[][],
  depth_map?: number[][],
  season?: string,
) {
  return (
    !!key &&
    key.width === width &&
    key.height === height &&
    key.origin_x === origin_x &&
    key.origin_y === origin_y &&
    (key.tiles === tiles || key.terrain_signature === terrain_signature) &&
    key.biomes === biomes &&
    key.depth_map === depth_map &&
    key.season === season
  )
}

// Downscaled copy of the base terrain, rebuilt only when the terrain or
// the render scale changes. Drawing this 1:1 each frame is far cheaper
// than having the browser rescale the full 4800x2400 base every frame.
export let _scaledBase: {
  key: BaseLayerKey
  scale: number
  canvas: HTMLCanvasElement
} | null = null

export function getScaledBase(scale: number): HTMLCanvasElement | null {
  const baseCanvas = _baseCanvas
  const key = _baseKey
  if (!baseCanvas || !key) return null
  if (_scaledBase && _scaledBase.key === key && _scaledBase.scale === scale) {
    return _scaledBase.canvas
  }
  const w = Math.max(1, Math.round(baseCanvas.width * scale))
  const h = Math.max(1, Math.round(baseCanvas.height * scale))
  const canvas =
    _scaledBase && _scaledBase.canvas.width === w && _scaledBase.canvas.height === h
      ? _scaledBase.canvas
      : document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'low'
  ctx.drawImage(baseCanvas, 0, 0, w, h)
  _scaledBase = { key, scale, canvas }
  return canvas
}

// Food patches and mineral outcrops only change when the terrain grid
// changes (full frames), but the naive loop was issuing ~6 fillRects
// per food tile EVERY FRAME - profiling showed 300k fillRects/frame on
// an ocean-heavy world. Bake them into a scaled overlay once per
// (terrain, scale) and blit it like the base layer.
export let _tileDecor: {
  key: BaseLayerKey
  scale: number
  canvas: HTMLCanvasElement
} | null = null
export function getTileDecorLayer(scale: number): HTMLCanvasElement | null {
  const key = _baseKey
  if (!key) return null
  if (_tileDecor && _tileDecor.key === key && _tileDecor.scale === scale) {
    return _tileDecor.canvas
  }
  const w = Math.max(1, Math.round(key.width * TILE * scale))
  const h = Math.max(1, Math.round(key.height * TILE * scale))
  const canvas =
    _tileDecor && _tileDecor.canvas.width === w && _tileDecor.canvas.height === h
      ? _tileDecor.canvas
      : document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  ctx.clearRect(0, 0, key.width * TILE, key.height * TILE)
  ctx.imageSmoothingEnabled = false
  const tiles = key.tiles
  const ox = key.origin_x
  const oy = key.origin_y
  for (let row = 0; row < key.height; row++) {
    const tileRow = tiles[row]
    if (!tileRow) continue
    for (let col = 0; col < key.width; col++) {
      const tile = tileRow[col]
      if (tile !== TILE_ID.FOOD && tile !== TILE_ID.MINERAL) continue
      const seed = visualTileHash(col + ox, row + oy)
      const px = col * TILE
      const py = row * TILE
      if (tile === TILE_ID.FOOD) drawFoodPatch(ctx, px, py, seed)
      else drawMineralOutcrop(ctx, px, py, seed)
    }
  }
  _tileDecor = { key, scale, canvas }
  return canvas
}

// Ocean shimmer + night star-glints: same story as food tiles. The
// dynamic loops issued thousands of 2x1 fillRects per frame over open
// water. Bake both into half-resolution layers (they're 1-2px dots;
// softness is invisible) and animate with two cheap alpha-blended
// blits. Zoomed-in frames keep the original per-tile loops - bounds
// make them tiny there.
export interface WaterFxLayers {
  key: BaseLayerKey
  scale: number
  shimmer: HTMLCanvasElement
  stars: HTMLCanvasElement
}
export let _waterFx: WaterFxLayers | null = null
export function getWaterFxLayers(scale: number): WaterFxLayers | null {
  const key = _baseKey
  if (!key) return null
  if (_waterFx && _waterFx.key === key && _waterFx.scale === scale) return _waterFx
  const s = Math.max(0.05, scale / 2)
  const w = Math.max(1, Math.round(key.width * TILE * s))
  const h = Math.max(1, Math.round(key.height * TILE * s))
  const make = (prev: HTMLCanvasElement | null): HTMLCanvasElement => {
    const c = prev && prev.width === w && prev.height === h ? prev : document.createElement('canvas')
    c.width = w
    c.height = h
    return c
  }
  const prevShimmer = _waterFx?.shimmer ?? null
  const prevStars = _waterFx?.stars ?? null
  const shimmer = make(prevShimmer)
  const stars = make(prevStars)
  const shCtx = shimmer.getContext('2d')!
  const stCtx = stars.getContext('2d')!
  shCtx.setTransform(1, 0, 0, 1, 0, 0)
  shCtx.clearRect(0, 0, w, h)
  stCtx.setTransform(1, 0, 0, 1, 0, 0)
  stCtx.clearRect(0, 0, w, h)
  shCtx.fillStyle = 'rgba(180,230,255,1)'
  stCtx.fillStyle = 'rgba(255,255,255,1)'
  const tiles = key.tiles
  const dm = key.depth_map
  for (let row = 0; row < key.height; row++) {
    const tileRow = tiles[row]
    if (!tileRow) continue
    for (let col = 0; col < key.width; col++) {
      const d = permanentWaterDepth(tileRow[col], dm?.[row]?.[col])
      if (d === null) continue
      let hash = (col * 374761393 + row * 668265263) | 0
      hash = ((hash ^ (hash >>> 13)) * 1274126177) >>> 0
      const px = (col * TILE + ((hash >>> 8) & 3)) * s
      const py = (row * TILE + ((hash >>> 10) & 3)) * s
      const pw = Math.max(1, Math.round(2 * s))
      const ph = Math.max(1, Math.round(1 * s))
      // ~25% of deep-water tiles sparkle; ~6% of all water glints.
      if (d >= 180 && ((hash >>> 12) & 7) < 2) shCtx.fillRect(px, py, pw, ph)
      if (((hash >>> 15) & 15) === 0) stCtx.fillRect(px, py, pw, ph)
    }
  }
  _waterFx = { key, scale, shimmer, stars }
  return _waterFx
}

// Tiles repainted per incremental base-layer update before falling back
// to a full rebuild. Wildfires can touch thousands of tiles at once;
// beyond this a full rebuild is simpler and comparable in cost.
export const MAX_INCREMENTAL_TILES = 6000

// Repaint one tile of the baked food/mineral decor layer after an
// incremental terrain update.
export function updateTileDecorTile(tid: number, col: number, row: number, ox: number, oy: number) {
  if (!_tileDecor) return
  const ctx = _tileDecor.canvas.getContext('2d')!
  const s = _tileDecor.scale
  ctx.setTransform(s, 0, 0, s, 0, 0)
  ctx.clearRect(col * TILE, row * TILE, TILE, TILE)
  if (tid !== TILE_ID.FOOD && tid !== TILE_ID.MINERAL) return
  const seed = visualTileHash(col + ox, row + oy)
  const px = col * TILE
  const py = row * TILE
  if (tid === TILE_ID.FOOD) drawFoodPatch(ctx, px, py, seed)
  else drawMineralOutcrop(ctx, px, py, seed)
}

// Refresh one region of the downscaled base copy after the full-res
// base changed underneath it.
export function updateScaledBaseRegion(tx0: number, ty0: number, tx1: number, ty1: number) {
  if (!_scaledBase || !_baseCanvas) return
  const s = _scaledBase.scale
  const ctx = _scaledBase.canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'low'
  const sx = tx0 * TILE
  const sy = ty0 * TILE
  const sw = (tx1 - tx0 + 1) * TILE
  const sh = (ty1 - ty0 + 1) * TILE
  ctx.drawImage(
    _baseCanvas,
    sx,
    sy,
    sw,
    sh,
    Math.round(sx * s),
    Math.round(sy * s),
    Math.round(sw * s),
    Math.round(sh * s),
  )
}

// Whether the cached base canvas was painted without trees, scattered decor and
// mountains (?cf=vegetation draws those as cubeforge sprites instead).
let _builtWithoutVegetation = false

export function getBaseLayerCanvas(world: WorldState): HTMLCanvasElement | null {
  const cfVegetation = cfOwns('vegetation')
  if (cfVegetation !== _builtWithoutVegetation) {
    _builtWithoutVegetation = cfVegetation
    _baseKey = null
  }
  const { width, height, tiles, biomes } = world.grid
  if (!tiles || tiles.length < height) return null
  const depth_map = world.grid.depth_map as number[][] | undefined
  const origin_x = world.grid.origin_x ?? 0
  const origin_y = world.grid.origin_y ?? 0
  const W = width * TILE
  const H = height * TILE

  // A hard winter frosts the land beyond an ordinary winter's browns.
  const season = world.hard_winter && world.season === 'scarcity' ? 'hard_winter' : world.season
  const terrain_signature =
    _baseKey?.tiles === tiles ? _baseKey.terrain_signature : terrainVisualSignature(tiles, width, height)
  if (
    _baseCanvas &&
    baseLayerMatches(
      _baseKey,
      width,
      height,
      origin_x,
      origin_y,
      tiles,
      terrain_signature,
      biomes,
      depth_map,
      season,
    )
  ) {
    if (_baseKey) _baseKey.tiles = tiles
    return _baseCanvas
  }

  // ── Incremental update path ─────────────────────────────────────────
  // The simulation re-sends the full tiles grid periodically (every 60
  // ticks). The array identity changes but usually only a handful of
  // tiles actually differ (fires, food, new huts). Diffing costs ~1ms;
  // repainting just those tiles beats a full 11.5M-pixel rebuild that
  // otherwise stalls the frame for hundreds of ms.
  if (
    _baseKey &&
    _baseCanvas &&
    _imgBuf &&
    _imgBuf.width === width * TILE &&
    _imgBuf.height === height * TILE &&
    _baseKey.width === width &&
    _baseKey.height === height &&
    _baseKey.origin_x === origin_x &&
    _baseKey.origin_y === origin_y &&
    _baseKey.season === season &&
    _baseKey.biomes === biomes &&
    _baseKey.depth_map === depth_map &&
    _baseKey.tiles !== tiles
  ) {
    const changes: Array<[number, number]> = []
    let diffOverflow = false
    const oldTiles = _baseKey.tiles
    for (let row = 0; row < height; row++) {
      const oldRow = oldTiles[row]
      const newRow = tiles[row]
      if (oldRow === newRow) continue
      if (!oldRow || !newRow) {
        diffOverflow = true
        break
      }
      for (let col = 0; col < width; col++) {
        if (oldRow[col] !== newRow[col]) {
          changes.push([row, col])
          if (changes.length > MAX_INCREMENTAL_TILES) {
            diffOverflow = true
            break
          }
        }
      }
      if (diffOverflow) break
    }

    if (!diffOverflow && changes.length > 0) {
      const canvas = _baseCanvas
      const baseCtx = canvas.getContext('2d')!
      // Repaint changed tile blocks into the shared ImageData buffer.
      for (const [row, col] of changes) {
        paintTileBlock(_imgBuf.data, W, tiles, biomes, depth_map, season, row, col)
        // Keep the baked decor layer in sync for food/mineral toggles.
        updateTileDecorTile(tiles[row][col], col, row, origin_x, origin_y)
      }
      // Expanded dirty bounds (+3 tile margin covers tree canopies and
      // foam edges). One region blit erases old sprites there; the
      // filtered redraws below repaint whatever still belongs.
      let bx0 = width
      let by0 = height
      let bx1 = 0
      let by1 = 0
      for (const [row, col] of changes) {
        if (col < bx0) bx0 = col
        if (col > bx1) bx1 = col
        if (row < by0) by0 = row
        if (row > by1) by1 = row
      }
      const m = Math.min(4, width, height)
      bx0 = Math.max(0, bx0 - m)
      by0 = Math.max(0, by0 - m)
      bx1 = Math.min(width - 1, bx1 + m)
      by1 = Math.min(height - 1, by1 + m)
      baseCtx.imageSmoothingEnabled = false
      baseCtx.putImageData(
        _imgBuf,
        0,
        0,
        bx0 * TILE,
        by0 * TILE,
        (bx1 - bx0 + 1) * TILE,
        (by1 - by0 + 1) * TILE,
      )
      const only = { x0: bx0, y0: by0, x1: bx1, y1: by1 }
      baseCtx.save()
      baseCtx.beginPath()
      baseCtx.rect(bx0 * TILE, by0 * TILE, (bx1 - bx0 + 1) * TILE, (by1 - by0 + 1) * TILE)
      baseCtx.clip()
      if (biomes) {
        drawNaturalDecor(baseCtx, width, height, tiles, biomes, origin_x, origin_y, only, !cfVegetation)
      }
      if (biomes && ATLAS_TOWN.complete && !cfVegetation) {
        drawTrees(baseCtx, width, height, tiles, biomes, origin_x, origin_y, only, season)
      }
      if (!cfVegetation) drawMountains(baseCtx, width, height, tiles, biomes, origin_x, origin_y, only)
      baseCtx.restore()
      // Refresh derived layers for the affected region.
      updateScaledBaseRegion(bx0, by0, bx1, by1)
      // Foam geometry is cheap to rebuild relative to pixels and keeps
      // shoreline highlights correct after land/water flips.
      _baseKey.foam = buildFoamPaths(tiles, width, height)
      _baseKey.tiles = tiles
      _baseKey.terrain_signature = terrainVisualSignature(tiles, width, height)
      return canvas
    }
    if (!diffOverflow && changes.length === 0) {
      // Fresh arrays, identical content - just re-point the cache.
      _baseKey.tiles = tiles
      return _baseCanvas
    }
    // diff overflow (or nothing changed): fall through to full rebuild.
  }

  const canvas =
    _baseCanvas && _baseCanvas.width === W && _baseCanvas.height === H
      ? _baseCanvas
      : document.createElement('canvas')
  canvas.width = W
  canvas.height = H

  const imgData = getReuseImgData(W, H)
  const d = imgData.data
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      paintTileBlock(d, W, tiles, biomes, depth_map, season, row, col)
    }
  }

  const baseCtx = canvas.getContext('2d')!
  baseCtx.imageSmoothingEnabled = false
  baseCtx.putImageData(imgData, 0, 0)
  if (biomes) {
    drawNaturalDecor(baseCtx, width, height, tiles, biomes, origin_x, origin_y, undefined, !cfVegetation)
  }
  if (biomes && ATLAS_TOWN.complete && !cfVegetation) {
    drawTrees(baseCtx, width, height, tiles, biomes, origin_x, origin_y, undefined, season)
  }
  if (!cfVegetation) drawMountains(baseCtx, width, height, tiles, biomes, origin_x, origin_y)
  _baseCanvas = canvas
  _baseKey = {
    width,
    height,
    origin_x,
    origin_y,
    tiles,
    terrain_signature,
    biomes,
    depth_map,
    season,
    foam: buildFoamPaths(tiles, width, height),
  }
  return canvas
}
