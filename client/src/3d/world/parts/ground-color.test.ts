import { describe, expect, it } from 'vitest'
import { groundColor, terrainSurfaceSignature } from './ground-color'
import { heightAt } from './terrain-utils'
import { TILE_ID } from '../../../world/terrain-ids'
import { TILE_RGB } from '../../../world/palette'

describe('3D terrain parity', () => {
  it('reuses terrain geometry for occupancy and sub-visible trail changes', () => {
    expect(terrainSurfaceSignature([[TILE_ID.GRASS]], [[1]])).toBe(
      terrainSurfaceSignature([[TILE_ID.FOOD]], [[15]]),
    )
    expect(terrainSurfaceSignature([[TILE_ID.GRASS]], [[1]])).not.toBe(
      terrainSurfaceSignature([[TILE_ID.GRASS]], [[64]]),
    )
    expect(terrainSurfaceSignature([[TILE_ID.GRASS]])).not.toBe(terrainSurfaceSignature([[TILE_ID.SCORCHED]]))
  })
  it('keeps rocks and snow at the shared 2D color rather than a biome tint', () => {
    for (const tile of [TILE_ID.ROCK, TILE_ID.SNOW]) {
      expect(groundColor(tile, 5, 'scarcity')).toEqual(TILE_RGB[tile].map((v) => v / 255))
    }
  })
  it('uses grass substrate beneath buildings, food and campfires', () => {
    for (const tile of [TILE_ID.HUT, TILE_ID.FOOD, TILE_ID.CAMPFIRE]) {
      expect(groundColor(tile, 1, 'recovery')).toEqual(groundColor(TILE_ID.GRASS, 1, 'recovery'))
    }
  })
  it('keeps ash, scorched ground and sand visually distinct', () => {
    const colors = [TILE_ID.ASH, TILE_ID.SCORCHED, TILE_ID.SAND, TILE_ID.GRASS].map((tile) =>
      groundColor(tile, 0).join(','),
    )
    expect(new Set(colors).size).toBe(4)
  })
  it('keeps shallow seabeds below the water plane instead of exposing dark coastal shelves', () => {
    for (const depth of [0, 150, 200, 253]) {
      expect(heightAt(0, 0, [[depth]], [[0]])).toBeLessThan(-0.55)
    }
  })
})
