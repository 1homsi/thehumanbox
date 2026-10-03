import { drawFoodPatch, drawMineralOutcrop, lineageEraTiers, visualTileHash } from './draw-helpers'

import { terrainDetail } from './terrain-detail'

import { drawMountains } from './mountains'

import type { WorldState } from '../../shared/types'

import { lineageColor } from '../../shared/constants'
import { ATLAS_TOWN, onAnyAtlasLoaded } from '../../shared/sprites'

import { drawCaravanSprite, drawRoad, drawTraffic } from './roads'

import { motionTime } from '../../shared/motion'

import { TILE_ID, isPermanentWaterTile, isWaterTile } from '../model/terrain-ids'
import {
  EDGE_EAST,
  EDGE_NORTH,
  EDGE_SOUTH,
  EDGE_WEST,
  baseTerrainTile,
  permanentWaterDepth,
  permanentWaterLandEdgeMask,
  terrainVisualSignature,
} from '../model/terrain-visuals'
import { isRuinedBuilding } from '../model/building-state'

import { oceanColor } from './landscape-style'

import { TILE, TILE_RGB, BIOME_RGBA, SEASON_LAND_TINT } from '../model/palette'

import { drawTrees, drawNaturalDecor } from './decorations'

export let _imgBuf: ImageData | null = null
export let _baseCanvas: HTMLCanvasElement | null = null
export let _ruinedBuildingSource: WorldState['buildings']
export let _ruinedBuildingTiles = new Set<string>()
// Shore-foam geometry is fully determined by the terrain grid, so it is
// baked into Path2Ds once per terrain rebuild instead of rescanning
// every tile twice per frame (that scan alone touched 360k+ tiles/frame
// on the 600x300 world).
export interface FoamPaths {
  thin: Path2D
  thick: Path2D[]
}
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

// Hut tiles are terrain-derived too; cache the positions per tiles array
// so the settlement-ring pass stops rescanning all 180k tiles per frame.
export let _hutSource: number[][] | null = null
export let _hutTiles: Array<[number, number]> = []
export function hutTileList(tiles: number[][]): Array<[number, number]> {
  if (tiles === _hutSource) return _hutTiles
  const out: Array<[number, number]> = []
  for (let row = 0; row < tiles.length; row++) {
    const tr = tiles[row]
    if (!tr) continue
    for (let col = 0; col < tr.length; col++) {
      if (tr[col] === TILE_ID.HUT) out.push([col, row])
    }
  }
  _hutSource = tiles
  _hutTiles = out
  return out
}

export interface HutCluster {
  cx: number
  cy: number
  count: number
}
export let _hutClusterSource: Array<[number, number]> | null = null
export let _hutClusters: HutCluster[] = []
export function cachedHutClusters(hutPositions: Array<[number, number]>): HutCluster[] {
  if (hutPositions === _hutClusterSource) return _hutClusters
  const clusters: HutCluster[] = []
  const usedInCluster = new Set<number>()
  for (let i = 0; i < hutPositions.length; i++) {
    if (usedInCluster.has(i)) continue
    const [hx, hy] = hutPositions[i]
    const cluster = [i]
    for (let j = i + 1; j < hutPositions.length; j++) {
      const [jx, jy] = hutPositions[j]
      const d2 = (hx - jx) ** 2 + (hy - jy) ** 2
      if (d2 < 64) {
        cluster.push(j)
        usedInCluster.add(j)
      }
    }
    usedInCluster.add(i)
    if (cluster.length < 3) continue
    clusters.push({
      cx: cluster.reduce((s, k) => s + hutPositions[k][0], 0) / cluster.length,
      cy: cluster.reduce((s, k) => s + hutPositions[k][1], 0) / cluster.length,
      count: cluster.length,
    })
  }
  _hutClusterSource = hutPositions
  _hutClusters = clusters
  return clusters
}

export function buildFoamPaths(tiles: number[][], width: number, height: number): FoamPaths {
  const thin = new Path2D()
  const thick = [new Path2D(), new Path2D(), new Path2D(), new Path2D()]
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const shore = permanentWaterLandEdgeMask(tiles, row, col)
      if (shore === 0) continue
      const px = col * TILE
      const py = row * TILE
      // Same hash the animated pulse used, bucketed four ways so the
      // shimmer keeps its spatial variety with four fills per frame.
      let h = (col * 374761393 + row * 668265263) | 0
      h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0
      const tp = thick[h & 3]
      if (shore & EDGE_NORTH) {
        thin.rect(px, py, TILE, 1)
        tp.rect(px, py, TILE, 2)
      }
      if (shore & EDGE_SOUTH) {
        thin.rect(px, py + TILE - 1, TILE, 1)
        tp.rect(px, py + TILE - 2, TILE, 2)
      }
      if (shore & EDGE_EAST) {
        thin.rect(px + TILE - 1, py, 1, TILE)
        tp.rect(px + TILE - 2, py, 2, TILE)
      }
      if (shore & EDGE_WEST) {
        thin.rect(px, py, 1, TILE)
        tp.rect(px, py, 2, TILE)
      }
    }
  }
  return { thin, thick }
}

export function ruinedBuildingTiles(buildings: WorldState['buildings']): ReadonlySet<string> {
  if (buildings === _ruinedBuildingSource) return _ruinedBuildingTiles
  const tiles = new Set<string>()
  for (const building of buildings ?? []) {
    if (!isRuinedBuilding(building)) continue
    const footprintWidth = Math.max(1, Math.floor(building.footprint?.[0] ?? building.fw ?? 1))
    const footprintHeight = Math.max(1, Math.floor(building.footprint?.[1] ?? building.fh ?? 1))
    for (let dy = 0; dy < footprintHeight; dy++) {
      for (let dx = 0; dx < footprintWidth; dx++) {
        tiles.add(`${Math.floor(building.x + dx)},${Math.floor(building.y + dy)}`)
      }
    }
  }
  _ruinedBuildingSource = buildings
  _ruinedBuildingTiles = tiles
  return tiles
}

export const MAX_TRADE_ROUTES_2D = 48
export const MAX_CARAVANS_2D = 64

export function isFinitePoint(point: [number, number]): boolean {
  return Number.isFinite(point[0]) && Number.isFinite(point[1])
}

export function drawTradeNetwork2D(
  ctx: CanvasRenderingContext2D,
  world: WorldState,
  bounds: { c0: number; c1: number; r0: number; r1: number },
  now: number,
  layer: 'roads' | 'caravans',
) {
  if (!world.trade_routes?.length && !world.caravans?.length) return

  const ox = world.grid.origin_x ?? 0
  const oy = world.grid.origin_y ?? 0
  const margin = 8
  const isVisible = (x: number, y: number) =>
    x >= bounds.c0 - margin && x <= bounds.c1 + margin && y >= bounds.r0 - margin && y <= bounds.r1 + margin

  const visibleRoutes: NonNullable<WorldState['trade_routes']> = []
  for (const route of world.trade_routes ?? []) {
    if (!isFinitePoint(route.a_center) || !isFinitePoint(route.b_center)) continue
    const ax = route.a_center[0] - ox
    const ay = route.a_center[1] - oy
    const bx = route.b_center[0] - ox
    const by = route.b_center[1] - oy
    if (
      Math.max(ax, bx) < bounds.c0 - margin ||
      Math.min(ax, bx) > bounds.c1 + margin ||
      Math.max(ay, by) < bounds.r0 - margin ||
      Math.min(ay, by) > bounds.r1 + margin
    ) {
      continue
    }
    visibleRoutes.push(route)
    if (visibleRoutes.length >= MAX_TRADE_ROUTES_2D) break
  }

  type VisibleCaravan = {
    caravan: NonNullable<WorldState['caravans']>[number]
    localX: number
    localY: number
  }
  const visibleCaravans: VisibleCaravan[] = []
  for (const caravan of world.caravans ?? []) {
    if (!isFinitePoint(caravan.from) || !isFinitePoint(caravan.to)) continue
    const duration = Math.max(1, caravan.arrives_tick - caravan.departed_tick)
    const progress = Math.max(0, Math.min(1, (world.tick - caravan.departed_tick) / duration))
    const localX = caravan.from[0] + (caravan.to[0] - caravan.from[0]) * progress - ox
    const localY = caravan.from[1] + (caravan.to[1] - caravan.from[1]) * progress - oy
    if (!isVisible(localX, localY)) continue
    visibleCaravans.push({ caravan, localX, localY })
    if (visibleCaravans.length >= MAX_CARAVANS_2D) break
  }

  if (visibleRoutes.length === 0 && visibleCaravans.length === 0) return

  // Roads lie on the ground under the towns; carts and trucks travel on top.
  const tiers = lineageEraTiers(world.lineage_eras)
  const tierOf = (a: string, b: string) => Math.max(tiers.get(a) ?? 0, tiers.get(b) ?? 0)
  if (layer === 'roads') {
    for (const route of visibleRoutes) {
      const startX = (route.a_center[0] - ox + 0.5) * TILE
      const startY = (route.a_center[1] - oy + 0.5) * TILE
      const endX = (route.b_center[0] - ox + 0.5) * TILE
      const endY = (route.b_center[1] - oy + 0.5) * TILE
      const tier = tierOf(route.lineage_a, route.lineage_b)
      drawRoad(ctx, startX, startY, endX, endY, tier, TILE)
      drawTraffic(
        ctx,
        startX,
        startY,
        endX,
        endY,
        tier,
        TILE,
        motionTime(now),
        Math.round(route.a_center[0] * 31 + route.b_center[1]),
      )
    }
    return
  }
  for (const { caravan, localX, localY } of visibleCaravans) {
    const px = (localX + 0.5) * TILE
    const py = (localY + 0.5) * TILE + Math.sin(now / 170 + caravan.id * 0.73) * 0.6
    const angle = Math.atan2(caravan.to[1] - caravan.from[1], caravan.to[0] - caravan.from[0])
    const tier = tiers.get(caravan.sender_lineage) ?? 0
    drawCaravanSprite(ctx, px, py, angle, tier, lineageColor(caravan.sender_lineage), TILE)
  }
}

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

export function vnHash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177) | 0
  return ((h >>> 0) & 0xffff) / 0xffff
}

// Tiles repainted per incremental base-layer update before falling back
// to a full rebuild. Wildfires can touch thousands of tiles at once;
// beyond this a full rebuild is simpler and comparable in cost.
export const MAX_INCREMENTAL_TILES = 6000

export function varAmountForTile(tid: number): number {
  if (tid === 2 || tid === 9) return 2
  if (tid === 1 || tid === 3) return 2
  if (tid === 5) return 3
  if (tid === 6) return 9
  if (tid === 12) return 3
  if (tid === 13) return 2
  return 4
}

// Paint one tile's TILE x TILE pixel block into the base ImageData.
// Extracted from the full-grid rebuild loop so incremental updates can
// repaint individual tiles with byte-identical results.
export function paintTileBlock(
  d: Uint8ClampedArray<ArrayBufferLike>,
  W: number,
  tiles: number[][],
  biomes: number[][] | undefined,
  depth_map: number[][] | undefined,
  season: string | undefined,
  row: number,
  col: number,
) {
  const height = tiles.length
  const tileRow = tiles[row]
  const biomeRow = biomes?.[row]
  const depthRow = depth_map?.[row]
  const tileRowPrev = row > 0 ? tiles[row - 1] : undefined
  const tileRowNext = row + 1 < height ? tiles[row + 1] : undefined
  const rawTid = tileRow?.[col] ?? TILE_ID.VOID
  const tid = baseTerrainTile(rawTid)
  const rgb = TILE_RGB[tid] ?? TILE_RGB[0]
  let r = rgb[0]
  let g = rgb[1]
  let b = rgb[2]

  const isWater = isWaterTile(rawTid)
  const isPermanentWater = isPermanentWaterTile(rawTid)
  const wN = tileRowPrev?.[col]
  const wS = tileRowNext?.[col]
  const wW = col > 0 ? tileRow?.[col - 1] : undefined
  const wE = tileRow?.[col + 1]
  const touchesLand =
    (wN !== undefined && !isWaterTile(wN)) ||
    (wS !== undefined && !isWaterTile(wS)) ||
    (wW !== undefined && !isWaterTile(wW)) ||
    (wE !== undefined && !isWaterTile(wE))

  const visualDepth = permanentWaterDepth(rawTid, depthRow?.[col])
  if (visualDepth !== null) {
    ;[r, g, b] = oceanColor(visualDepth)
  }

  if (isPermanentWater && touchesLand) {
    r = (r * 0.68 + SHALLOW_RGB[0] * 0.32) | 0
    g = (g * 0.68 + SHALLOW_RGB[1] * 0.32) | 0
    b = (b * 0.68 + SHALLOW_RGB[2] * 0.32) | 0
  }

  if (!isWater && tid !== TILE_ID.ROCK && tid !== TILE_ID.SNOW) {
    const bm = biomeRow?.[col] ?? 0
    const bo = BIOME_RGBA[bm]
    if (bo) {
      const a = bo[3]
      if (a > 0) {
        const ia = 1 - a
        r = (r * ia + bo[0] * a) | 0
        g = (g * ia + bo[1] * a) | 0
        b = (b * ia + bo[2] * a) | 0
      }
    }
  }

  const macro = valueNoise(col / 42, row / 42) * 0.65 + valueNoise(col / 13 + 7, row / 13 + 7) * 0.35
  let shading = ((macro - 0.5) * (isWater ? 5 : 25)) | 0
  if (!isWater) {
    const grassy = tid === 1 || tid === 3 || tid === 6 || tid === 13
    const landTint = SEASON_LAND_TINT[season ?? '']
    if (grassy && landTint) {
      let w = landTint.w * (0.55 + macro * 0.9)
      if (w > 0.85) w = 0.85
      const iw = 1 - w
      r = (r * iw + landTint.rgb[0] * w) | 0
      g = (g * iw + landTint.rgb[1] * w) | 0
      b = (b * iw + landTint.rgb[2] * w) | 0
      shading += ((macro - 0.5) * 8) | 0
    }
  }

  const varAmt = varAmountForTile(tid)
  const bx = col * TILE
  const by = row * TILE
  for (let ty = 0; ty < TILE; ty++) {
    const gy = by + ty
    let pi = (gy * W + bx) * 4
    for (let tx = 0; tx < TILE; tx++, pi += 4) {
      const gx = bx + tx
      // Texture in small pixel-art clusters instead of independent
      // per-pixel static. The macro field shapes broad biome patches;
      // this 2x2 dither keeps nearby terrain readable at game scale.
      const clusterX = gx >> 1
      const clusterY = gy >> 1
      let h = (clusterX * 374761393 + clusterY * 668265263) | 0
      h = Math.imul(h ^ (h >>> 13), 1274126177) | 0
      const dither = ((gx ^ gy) & 1) === 0 ? -1 : 1
      const k = (((((h >>> 0) & 0xff) - 128) * varAmt) >> 7) + dither + terrainDetail(tid, gx, gy)
      let rr = r + k + shading
      let gg = g + k + shading
      let bb = b + k + shading
      if (rr < 0) rr = 0
      else if (rr > 255) rr = 255
      if (gg < 0) gg = 0
      else if (gg > 255) gg = 255
      if (bb < 0) bb = 0
      else if (bb > 255) bb = 255
      d[pi] = rr
      d[pi + 1] = gg
      d[pi + 2] = bb
      d[pi + 3] = 255
    }
  }
}

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

export function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const fx = x - xi
  const fy = y - yi
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const a = vnHash(xi, yi)
  const b = vnHash(xi + 1, yi)
  const c = vnHash(xi, yi + 1)
  const d = vnHash(xi + 1, yi + 1)
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
}

export const SHALLOW_RGB: [number, number, number] = [116, 198, 208]

export function getBaseLayerCanvas(world: WorldState): HTMLCanvasElement | null {
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
        drawNaturalDecor(baseCtx, width, height, tiles, biomes, origin_x, origin_y, only)
      }
      if (biomes && ATLAS_TOWN.complete) {
        drawTrees(baseCtx, width, height, tiles, biomes, origin_x, origin_y, only, season)
      }
      drawMountains(baseCtx, width, height, tiles, biomes, origin_x, origin_y, only)
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
    drawNaturalDecor(baseCtx, width, height, tiles, biomes, origin_x, origin_y)
  }
  if (biomes && ATLAS_TOWN.complete) {
    drawTrees(baseCtx, width, height, tiles, biomes, origin_x, origin_y, undefined, season)
  }
  drawMountains(baseCtx, width, height, tiles, biomes, origin_x, origin_y)
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
