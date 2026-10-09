import type { Tileset } from 'xipjs'
import { TILE } from '../../model/palette'
import { buildFlatTilesetPixels, terrainTilesetPixels, terrainVariants } from './tileset'
import type { TilesetPixels } from './tileset'

let tileset: Tileset | null = null
let flatTileset: Tileset | null = null

function toTileset(px: TilesetPixels): Tileset {
  const canvas = document.createElement('canvas')
  canvas.width = px.width
  canvas.height = px.height
  const ctx = canvas.getContext('2d')!
  ctx.putImageData(new ImageData(new Uint8ClampedArray(px.data), px.width, px.height), 0, 0)
  return { image: canvas, tileWidth: TILE, tileHeight: TILE, columns: px.columns }
}

/**
 * The terrain tileset as a xipjs `Tileset` backed by a canvas. One shared object: TileLayer
 * syncs the tileset by identity, so every layer must be given this same instance.
 */
export function getTerrainTileset(): Tileset {
  tileset ??= toTileset(terrainTilesetPixels())
  return tileset
}

/** The flat (one colour per kind) tileset for far zoom. Same layout as {@link getTerrainTileset}. */
export function getFlatTerrainTileset(): Tileset {
  flatTileset ??= toTileset(buildFlatTilesetPixels())
  return flatTileset
}

/** Stable identity for `useTileLayer`'s `variants`. */
export const TERRAIN_VARIANTS = terrainVariants()
