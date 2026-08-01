/**
 * Wire-level terrain IDs shared with sim-core.
 *
 * Keep these values in lockstep with:
 * simulation/sim-core/src/world/tiles.rs
 */
export const TILE_ID = {
  VOID: 0,
  GRASS: 1,
  WATER: 2,
  FOOD: 3,
  FIRE: 4,
  ROCK: 5,
  ASH: 6,
  CAMPFIRE: 7,
  HUT: 8,
  FLOODED: 9,
  MINERAL: 10,
  SCORCHED: 11,
  SNOW: 12,
  SAND: 13,
} as const

export const BIOME_ID = {
  GRASSLAND: 0,
  FOREST: 1,
  DESERT: 2,
  WETLAND: 3,
  TUNDRA: 4,
  VOLCANIC: 5,
} as const

export function isWaterTile(tile: number | undefined): boolean {
  return tile === TILE_ID.WATER || tile === TILE_ID.FLOODED
}

/** Permanent lakes/ocean. Floodwater is rendered as a separate shallow overlay. */
export function isPermanentWaterTile(tile: number | undefined): boolean {
  return tile === TILE_ID.WATER
}
