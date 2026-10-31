import { describe, expect, it } from 'vitest'
import { TILE } from '../../../model/palette'
import { BIOME_ID, TILE_ID } from '../../../model/terrain-ids'
import { buildFringe } from './biome-fringe'

/** A grass grid, forest on the left half and grassland on the right. */
function split(width = 8, height = 6) {
  const tiles = Array.from({ length: height }, () => Array(width).fill(TILE_ID.GRASS))
  const biomes = Array.from({ length: height }, () =>
    Array.from({ length: width }, (_, c) => (c < width / 2 ? BIOME_ID.FOREST : BIOME_ID.GRASSLAND)),
  )
  return { tiles, biomes, width, height }
}

describe('the ragged edge between kinds of ground', () => {
  it('lays runs along a border, one or two pixels into each side, and nowhere else', () => {
    const { tiles, biomes, width, height } = split()
    const runs = buildFringe(tiles, biomes, undefined, 'abundance', width, height)
    expect(runs.length).toBeGreaterThan(0)
    const border = (width / 2) * TILE
    for (let k = 0; k < runs.length; k += 5) {
      const [x, , w, h] = runs.slice(k, k + 4)
      expect(w === 1 || w === 2 || h === 1 || h === 2).toBe(true)
      // Every run touches the column of tiles either side of the border.
      expect(x + w).toBeGreaterThan(border - TILE)
      expect(x).toBeLessThan(border + TILE)
      // Whole pixels only.
      expect(Number.isInteger(x) && Number.isInteger(w) && Number.isInteger(h)).toBe(true)
    }
  })

  it('draws nothing on one kind of ground, on water, and without a biome grid', () => {
    const { tiles, width, height } = split()
    const same = Array.from({ length: height }, () => Array(width).fill(BIOME_ID.GRASSLAND))
    expect(buildFringe(tiles, same, undefined, 'abundance', width, height)).toEqual([])
    const water = Array.from({ length: height }, () => Array(width).fill(TILE_ID.WATER))
    expect(buildFringe(water, split().biomes, undefined, 'abundance', width, height)).toEqual([])
    expect(buildFringe(tiles, undefined, undefined, 'abundance', width, height)).toEqual([])
  })

  it('leaves shades inside one biome alone', () => {
    const { tiles, width, height } = split()
    const same = Array.from({ length: height }, () => Array(width).fill(BIOME_ID.GRASSLAND))
    // A dry patch would differ in colour from the meadow beside it; still no fringe without a biome border.
    expect(buildFringe(tiles, same, undefined, 'scarcity', width, height)).toEqual([])
  })

  it('is the same every time it is built', () => {
    const { tiles, biomes, width, height } = split()
    expect(buildFringe(tiles, biomes, undefined, 'abundance', width, height)).toEqual(
      buildFringe(tiles, biomes, undefined, 'abundance', width, height),
    )
  })
})
