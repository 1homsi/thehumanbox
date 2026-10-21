import { describe, expect, it } from 'vitest'
import {
  OCEAN_BANDS,
  SHALLOWS_BAND,
  isFreshWaterAt,
  oceanBand,
  oceanColor,
  seaBandAt,
  seaDepthAt,
  shorelineColors,
  landscapeHash,
  vegetationSeason,
} from './landscape-style'
import { OCEAN } from './art-palette'
import { BIOME_ID, TILE_ID } from '../model/terrain-ids'

describe('landscape art direction', () => {
  it('uses the inverse wire depth to keep deep water darker than shallows', () => {
    const deep = oceanColor(0)
    const shallow = oceanColor(200)
    expect(shallow[1]).toBeGreaterThan(deep[1])
    expect(oceanColor(220)).toEqual(shallow)
    expect(oceanColor(-1)).toEqual(deep)
  })

  it('steps the sea through the chart bands, abyss to shallows, with no smooth ramp between', () => {
    expect(oceanColor(0)).toEqual(OCEAN.abyss)
    expect(oceanColor(200)).toEqual(OCEAN.shallows)
    const seen = new Set<string>()
    let last = -1
    for (let wire = 0; wire <= 200; wire++) {
      const band = oceanBand(wire)
      expect(band).toBeGreaterThanOrEqual(last)
      last = band
      expect(oceanColor(wire)).toBe(OCEAN_BANDS[band])
      seen.add(oceanColor(wire).join())
    }
    expect(seen.size).toBe(OCEAN_BANDS.length)
    expect(last).toBe(SHALLOWS_BAND)
  })

  it('lets the sea fall away to the abyss at the edge of the world, whatever its size', () => {
    for (const [width, height] of [
      [600, 300],
      [800, 400],
    ]) {
      expect(seaDepthAt(200, 0, 50, width, height)).toBe(0)
      expect(seaDepthAt(200, 50, width - 1, width, height)).toBe(0)
      expect(seaDepthAt(200, height - 1, 50, width, height)).toBe(0)
      expect(oceanBand(seaDepthAt(200, 1, 50, width, height))).toBeLessThan(SHALLOWS_BAND)
      // Inland of the margin the depth is the simulation's own.
      expect(seaDepthAt(150, 40, 60, width, height)).toBe(150)
    }
  })

  it('tells rivers and lakes from open sea that only passes their depth on a gradient', () => {
    const W = TILE_ID.WATER
    const L = TILE_ID.GRASS
    const tiles = [
      [L, W, L, W, W, W],
      [L, W, L, W, W, W],
      [L, W, L, W, W, W],
    ]
    const depth = [
      [255, 184, 255, 178, 184, 190],
      [255, 184, 255, 179, 184, 189],
      [255, 184, 255, 180, 184, 188],
    ]
    expect(isFreshWaterAt(tiles, depth, 1, 1)).toBe(true)
    expect(isFreshWaterAt(tiles, depth, 1, 4)).toBe(false)
    expect(seaBandAt(tiles, depth, 1, 1)).toBe(-1)
    expect(seaBandAt(tiles, depth, 1, 0)).toBe(-1)
    // Sea, though this small map's edge pulls it toward the abyss.
    expect(seaBandAt(tiles, depth, 1, 4)).toBe(oceanBand(seaDepthAt(184, 1, 4, 6, 3)))
    // Missing depth reads as shallows (water the simulation has not measured).
    expect(
      seaBandAt(
        [
          [L, W, W, W, L],
          [L, W, W, W, L],
          [L, W, W, W, L],
          [L, W, W, W, L],
        ],
        undefined,
        1,
        2,
      ),
    ).toBe(oceanBand(seaDepthAt(220, 1, 2, 5, 4)))
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

describe('natural decoration placement', () => {
  it('preserves random low bits instead of carpeting every tile with decorations', () => {
    let flowers = 0
    const buckets = new Set<number>()
    for (let y = 0; y < 100; y++)
      for (let x = 0; x < 100; x++) {
        const sample = landscapeHash(x + 100000, y - 100000) & 255
        buckets.add(sample)
        if (sample / 255 < 0.06) flowers++
      }
    expect(buckets.size).toBeGreaterThan(240)
    expect(flowers).toBeGreaterThan(400)
    expect(flowers).toBeLessThan(850)
    expect(landscapeHash(700, -12)).toBe(landscapeHash(700, -12))
  })
  it('uses actual ecological seasons for the tree atlas variants', () => {
    expect(vegetationSeason('decline')).toBe('autumn')
    expect(vegetationSeason('scarcity')).toBe('winter')
    expect(vegetationSeason('abundance')).toBe('summer')
    expect(vegetationSeason('recovery')).toBe('spring')
    expect(vegetationSeason('autumn')).toBe('autumn')
  })
})
