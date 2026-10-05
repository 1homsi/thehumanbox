import { drawFoodPatch, drawMineralOutcrop, drawPixelFire, visualTileHash } from './draw-helpers'
import { getBuildingSprite, PAD as SPRITE_PAD, PAD_BOT as SPRITE_PAD_BOT } from './building-sprites'
import { drawMountains } from './mountains'
import type { WorldState } from '../../shared/types'
import { ATLAS_TOWN, onAnyAtlasLoaded } from '../../shared/sprites'
import { TILE_ID } from '../model/terrain-ids'
import { terrainVisualSignature } from '../model/terrain-visuals'
import { TILE } from '../model/palette'
import { drawTrees, drawNaturalDecor } from './decorations'
import { tileColor } from './base-parts/tile-paint'
import { terrainSeason } from './terrain-season'

// The ground of the 2D fallback (browsers without WebGL2): one cached bitmap of the whole map with
// flat-coloured tiles, scattered detail, shores, trees and mountains. On cubeforge the ground is a
// TileLayer and the rest are sprite layers, so none of this runs there.

interface BaseKey {
  width: number
  height: number
  origin_x: number
  origin_y: number
  tiles: number[][]
  terrain_signature: number
  biomes?: number[][]
  depth_map?: number[][]
  season?: string
}

let _baseCanvas: HTMLCanvasElement | null = null
let _baseKey: BaseKey | null = null
let _scaledBase: { key: BaseKey; scale: number; canvas: HTMLCanvasElement } | null = null

onAnyAtlasLoaded(() => {
  _baseKey = null
})

function matches(
  key: BaseKey | null,
  width: number,
  height: number,
  origin_x: number,
  origin_y: number,
  tiles: number[][],
  terrain_signature: number,
  biomes: number[][] | undefined,
  depth_map: number[][] | undefined,
  season: string | undefined,
): boolean {
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

/** The map at 1:1 scaled down by `scale`, for zoomed-out frames; rebuilt only when the terrain or scale changes. */
export function getScaledBase(scale: number): HTMLCanvasElement | null {
  const baseCanvas = _baseCanvas
  const key = _baseKey
  if (!baseCanvas || !key) return null
  if (_scaledBase && _scaledBase.key === key && _scaledBase.scale === scale) return _scaledBase.canvas
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

const colorScratch = new Int32Array(4)
const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v)

/** The cached base canvas of the 2D fallback, rebuilt when the terrain, biomes, depth or season change. */
export function getBaseLayerCanvas(world: WorldState): HTMLCanvasElement | null {
  const { width, height, tiles, biomes } = world.grid
  if (!tiles || tiles.length < height) return null
  const depth_map = world.grid.depth_map as number[][] | undefined
  const origin_x = world.grid.origin_x ?? 0
  const origin_y = world.grid.origin_y ?? 0
  const season = terrainSeason(world)
  const signature =
    _baseKey && _baseKey.tiles === tiles
      ? _baseKey.terrain_signature
      : terrainVisualSignature(tiles, width, height)
  if (
    _baseCanvas &&
    matches(_baseKey, width, height, origin_x, origin_y, tiles, signature, biomes, depth_map, season)
  ) {
    return _baseCanvas
  }

  const W = width * TILE
  const H = height * TILE
  const canvas = _baseCanvas ?? document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      tileColor(colorScratch, tiles, biomes, depth_map, season, row, col)
      const shade = colorScratch[3]
      ctx.fillStyle = `rgb(${clamp(colorScratch[0] + shade)},${clamp(colorScratch[1] + shade)},${clamp(colorScratch[2] + shade)})`
      ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
    }
  }
  if (biomes) drawNaturalDecor(ctx, width, height, tiles, biomes, origin_x, origin_y)
  // Resources, huts and fires sit on the ground as it was at the last terrain change.
  for (let row = 0; row < height; row++) {
    const tileRow = tiles[row]
    if (!tileRow) continue
    for (let col = 0; col < width; col++) {
      const tile = tileRow[col]
      const px = col * TILE
      const py = row * TILE
      if (tile === TILE_ID.FOOD) drawFoodPatch(ctx, px, py, visualTileHash(col + origin_x, row + origin_y))
      else if (tile === TILE_ID.MINERAL)
        drawMineralOutcrop(ctx, px, py, visualTileHash(col + origin_x, row + origin_y))
      else if (tile === TILE_ID.FIRE || tile === TILE_ID.CAMPFIRE)
        drawPixelFire(ctx, px, py, world.grid.fire_intensity?.[row]?.[col] ?? 1, 0, tile === TILE_ID.CAMPFIRE)
      else if (tile === TILE_ID.HUT) {
        const variant = (((col * 73856093) ^ (row * 19349663)) >>> 0) & 7
        const sprite = getBuildingSprite('Hut', 1, 1, TILE, variant, 0, 1)
        if (sprite)
          ctx.drawImage(
            sprite,
            Math.round(px - SPRITE_PAD),
            Math.round(py + TILE + SPRITE_PAD_BOT - sprite.height),
          )
      }
    }
  }
  if (biomes && ATLAS_TOWN.complete)
    drawTrees(ctx, width, height, tiles, biomes, origin_x, origin_y, undefined, season)
  drawMountains(ctx, width, height, tiles, biomes, origin_x, origin_y)
  _baseCanvas = canvas
  _baseKey = {
    width,
    height,
    origin_x,
    origin_y,
    tiles,
    terrain_signature: signature,
    biomes,
    depth_map,
    season,
  }
  return canvas
}
