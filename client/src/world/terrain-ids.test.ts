import { describe, expect, it } from 'vitest'
import { BIOME_ID, TILE_ID, isWaterTile } from './terrain-ids'

describe('terrain wire IDs', () => {
  it('matches the complete sim-core Tile repr', () => {
    expect(TILE_ID).toEqual({
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
    })
  })

  it('matches the complete sim-core Biome repr', () => {
    expect(BIOME_ID).toEqual({
      GRASSLAND: 0,
      FOREST: 1,
      DESERT: 2,
      WETLAND: 3,
      TUNDRA: 4,
      VOLCANIC: 5,
    })
  })

  it('treats standing and flood water as water', () => {
    expect(isWaterTile(TILE_ID.WATER)).toBe(true)
    expect(isWaterTile(TILE_ID.FLOODED)).toBe(true)
    expect(isWaterTile(TILE_ID.GRASS)).toBe(false)
    expect(isWaterTile(undefined)).toBe(false)
  })
})
