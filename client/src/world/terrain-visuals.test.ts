import { describe, expect, it } from 'vitest'
import { TILE_ID } from './terrain-ids'
import {
  EDGE_EAST,
  EDGE_NORTH,
  EDGE_SOUTH,
  EDGE_WEST,
  baseTerrainTile,
  permanentWaterDepth,
  permanentWaterLandEdgeMask,
  permanentWaterNeighborMask,
  terrainVisualSignature,
} from './terrain-visuals'

describe('2D terrain visual semantics', () => {
  it('renders occupancy tiles over a stable ground substrate', () => {
    for (const tile of [TILE_ID.FOOD, TILE_ID.FIRE, TILE_ID.CAMPFIRE, TILE_ID.HUT, TILE_ID.MINERAL]) {
      expect(baseTerrainTile(tile)).toBe(TILE_ID.GRASS)
    }
    expect(baseTerrainTile(TILE_ID.WATER)).toBe(TILE_ID.WATER)
    expect(baseTerrainTile(TILE_ID.FLOODED)).toBe(TILE_ID.FLOODED)
  })

  it('keeps the base signature stable when only occupancy changes', () => {
    const grass = [[TILE_ID.GRASS, TILE_ID.GRASS]]
    const food = [[TILE_ID.FOOD, TILE_ID.FOOD]]
    expect(terrainVisualSignature(food, 2, 1)).toBe(terrainVisualSignature(grass, 2, 1))
    expect(terrainVisualSignature([[TILE_ID.GRASS, TILE_ID.HUT]], 2, 1)).not.toBe(
      terrainVisualSignature(grass, 2, 1),
    )
    expect(terrainVisualSignature([[TILE_ID.WATER, TILE_ID.GRASS]], 2, 1)).not.toBe(
      terrainVisualSignature(grass, 2, 1),
    )
  })

  it('creates beaches only beside permanent water', () => {
    const tiles = [
      [TILE_ID.GRASS, TILE_ID.WATER, TILE_ID.GRASS],
      [TILE_ID.WATER, TILE_ID.GRASS, TILE_ID.FLOODED],
      [TILE_ID.GRASS, TILE_ID.FLOODED, TILE_ID.GRASS],
    ]
    expect(permanentWaterNeighborMask(tiles, 1, 1)).toBe(EDGE_NORTH | EDGE_WEST)
    expect(permanentWaterNeighborMask(tiles, 2, 2)).toBe(0)
  })

  it('does not draw foam between permanent water and floodwater', () => {
    const tiles = [
      [TILE_ID.GRASS, TILE_ID.GRASS, TILE_ID.GRASS],
      [TILE_ID.GRASS, TILE_ID.WATER, TILE_ID.FLOODED],
      [TILE_ID.GRASS, TILE_ID.GRASS, TILE_ID.GRASS],
    ]
    expect(permanentWaterLandEdgeMask(tiles, 1, 1)).toBe(EDGE_NORTH | EDGE_SOUTH | EDGE_WEST)
    expect(permanentWaterLandEdgeMask(tiles, 1, 2)).toBe(0)
    expect(permanentWaterNeighborMask(tiles, 1, 2)).toBe(EDGE_WEST)
    expect(EDGE_EAST).toBe(8)
  })

  it('uses depth as shading data without reviving stale water', () => {
    expect(permanentWaterDepth(TILE_ID.WATER, 80)).toBe(80)
    expect(permanentWaterDepth(TILE_ID.WATER, 255)).toBe(220)
    expect(permanentWaterDepth(TILE_ID.WATER, undefined)).toBe(220)
    expect(permanentWaterDepth(TILE_ID.GRASS, 80)).toBeNull()
    expect(permanentWaterDepth(TILE_ID.FLOODED, 80)).toBeNull()
  })
})
