// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { TILE_ID } from '../../../model/terrain-ids'
import { terrainGroundSignature, terrainVisualSignature } from '../../../model/terrain-visuals'
import { shoreTileKey } from '../../decorations'
import { buildFoamRects } from '../../foam'
import { mountainHeights } from '../../mountains'
import { buildWaterPlantRects } from './water-plants'

const W = 24
const H = 16

/** A lake with a shore, a rock range and a snowfield, grass round them. */
function world(): number[][] {
  const g = Array.from({ length: H }, () => new Array<number>(W).fill(TILE_ID.GRASS))
  for (let y = 3; y < 9; y++) for (let x = 3; x < 10; x++) g[y]![x] = TILE_ID.WATER
  for (let y = 2; y < 6; y++) for (let x = 14; x < 20; x++) g[y]![x] = TILE_ID.ROCK
  for (let y = 10; y < 14; y++) for (let x = 14; x < 20; x++) g[y]![x] = TILE_ID.SNOW
  return g
}

/** The ground drivers' output for a grid, as plain values. */
function groundOutput(tiles: number[][]) {
  const shore: (string | null)[] = []
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) shore.push(shoreTileKey(tiles, undefined, x, y, 0, 0))
  return {
    shore,
    foam: buildFoamRects(tiles, W, H),
    plants: buildWaterPlantRects(tiles, W, H, 0, 0),
    mountains: Array.from(mountainHeights(tiles, W, H)),
  }
}

describe('ground drivers and occupancy', () => {
  // Occupancy only ever replaces grass: on the shore, beside the rock and the snow, and on open land.
  const spots: [number, number][] = [
    [2, 5],
    [10, 5],
    [13, 3],
    [13, 11],
    [16, 7],
    [6, 11],
  ]

  for (const occupant of [TILE_ID.FIRE, TILE_ID.CAMPFIRE, TILE_ID.HUT, TILE_ID.MINERAL]) {
    it(`gives the ground the same output when a tile holds ${occupant} instead of grass`, () => {
      const plain = world()
      const built = world()
      for (const [x, y] of spots) built[y]![x] = occupant
      expect(groundOutput(built)).toEqual(groundOutput(plain))
    })
  }

  it('is covered by the ground signature, not by the occupancy-aware one alone', () => {
    const plain = world()
    const built = world()
    built[5]![2] = TILE_ID.HUT
    expect(terrainGroundSignature(built, W, H)).toBe(terrainGroundSignature(plain, W, H))
    expect(terrainVisualSignature(built, W, H)).not.toBe(terrainVisualSignature(plain, W, H))
  })
})
