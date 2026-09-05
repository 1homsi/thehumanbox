import { describe, expect, it } from 'vitest'
import { oceanColor, shorelineColors } from './landscape-style'
import { BIOME_ID, TILE_ID } from '../../world/terrain-ids'

describe('landscape art direction', () => {
  it('uses the inverse wire depth to keep deep water darker than shallows', () => {
    const deep = oceanColor(0)
    const shallow = oceanColor(200)
    expect(shallow[1]).toBeGreaterThan(deep[1])
    expect(oceanColor(220)).toEqual(shallow)
    expect(oceanColor(-1)).toEqual(deep)
  })
  it('keeps snowy, rocky, wetland and sandy coastlines visually distinct', () => {
    const shores = [
      shorelineColors(TILE_ID.SNOW, BIOME_ID.TUNDRA),
      shorelineColors(TILE_ID.ROCK, BIOME_ID.GRASSLAND),
      shorelineColors(TILE_ID.GRASS, BIOME_ID.WETLAND),
      shorelineColors(TILE_ID.SAND, BIOME_ID.DESERT),
    ]
    expect(new Set(shores.map((shore) => shore.join())).size).toBe(4)
  })
})
