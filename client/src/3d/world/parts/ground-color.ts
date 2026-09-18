import { BIOME_RGBA, TILE_RGB, SEASON_LAND_TINT } from '../../../world/palette'
import { baseTerrainTile } from '../../../world/terrain-visuals'
import { TILE_ID, isWaterTile } from '../../../world/terrain-ids'

/** Shared 2D palette, returned in display space; vertex upload converts to linear. */
export function groundColor(tile: number, biome: number, season?: string): [number, number, number] {
  const base = baseTerrainTile(tile)
  const rgb = [...(TILE_RGB[base] ?? TILE_RGB[TILE_ID.GRASS])] as [number, number, number]
  const overlay = BIOME_RGBA[biome]
  if (!isWaterTile(tile) && base !== TILE_ID.ROCK && base !== TILE_ID.SNOW && overlay) {
    for (let i = 0; i < 3; i++) rgb[i] = rgb[i] * (1 - overlay[3]) + overlay[i] * overlay[3]
  }
  const tint = SEASON_LAND_TINT[season ?? '']
  if (tint && ([TILE_ID.GRASS, TILE_ID.FOOD, TILE_ID.ASH, TILE_ID.SAND] as number[]).includes(base)) {
    for (let i = 0; i < 3; i++) rgb[i] = rgb[i] * (1 - tint.w) + tint.rgb[i] * tint.w
  }
  return rgb.map((v) => v / 255) as [number, number, number]
}

/** Ignore occupancy changes and sub-visible trail wear when caching terrain meshes. */
export function terrainSurfaceSignature(tiles: number[][], trails?: number[][]): number {
  let hash = 2166136261
  for (let y = 0; y < tiles.length; y++) {
    for (let x = 0; x < tiles[y].length; x++) {
      hash = Math.imul(hash ^ baseTerrainTile(tiles[y][x]), 16777619)
      hash = Math.imul(hash ^ ((trails?.[y]?.[x] ?? 0) >>> 5), 16777619)
    }
  }
  return hash >>> 0
}
