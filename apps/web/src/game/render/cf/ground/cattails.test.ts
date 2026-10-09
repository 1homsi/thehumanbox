import { describe, expect, it } from 'vitest'
import { TILE } from '../../../model/palette'
import { BIOME_ID, TILE_ID } from '../../../model/terrain-ids'
import { buildCattailRects, isCattailGround } from './cattails'

const W = 40
const H = 40

function grid(fill: number): number[][] {
  return Array.from({ length: H }, () => Array.from({ length: W }, () => fill))
}

/** A marsh: wetland grass with a lake in its middle, so every grass cell by the lake is cattail ground. */
function marsh(): { tiles: number[][]; biomes: number[][] } {
  const tiles = grid(TILE_ID.GRASS)
  const biomes = grid(BIOME_ID.WETLAND)
  for (let y = 15; y < 25; y++) for (let x = 15; x < 25; x++) tiles[y]![x] = TILE_ID.WATER
  return { tiles, biomes }
}

describe('isCattailGround', () => {
  it('is wetland grass with water beside it', () => {
    const { tiles, biomes } = marsh()
    expect(isCattailGround(tiles, biomes, 14, 20)).toBe(true) // grass on the lake's west shore
    expect(isCattailGround(tiles, biomes, 5, 5)).toBe(false) // grass far from water
    expect(isCattailGround(tiles, biomes, 20, 20)).toBe(false) // water itself
  })

  it('is not grassland, even beside water', () => {
    const { tiles } = marsh()
    expect(isCattailGround(tiles, grid(BIOME_ID.GRASSLAND), 14, 20)).toBe(false)
  })
})

describe('buildCattailRects', () => {
  it('draws nothing without a biome grid', () => {
    const { tiles } = marsh()
    const out = buildCattailRects(tiles, undefined, W, H, 0, 0)
    expect(out.stalk).toHaveLength(0)
    expect(out.head).toHaveLength(0)
  })

  it('puts a head on every stalk, and a lit pixel on every head', () => {
    const { tiles, biomes } = marsh()
    const out = buildCattailRects(tiles, biomes, W, H, 0, 0)
    expect(out.stalk.length).toBeGreaterThan(0)
    expect(out.head.length).toBe(out.stalk.length)
    expect(out.headLit.length).toBe(out.stalk.length)
  })

  it('keeps every clump in the tile it stands in (heads may reach 2 px up), and only on wetland shore grass', () => {
    const { tiles, biomes } = marsh()
    const out = buildCattailRects(tiles, biomes, W, H, 0, 0)
    for (let i = 0; i < out.head.length; i += 4) {
      const [x, y, w, h] = [out.head[i]!, out.head[i + 1]!, out.head[i + 2]!, out.head[i + 3]!]
      // A head belongs to the tile its stalk stands in (its bottom edge); it reaches at most 2 px above that tile.
      const col = Math.floor(x / TILE)
      const row = Math.floor((y + h - 1) / TILE)
      expect(isCattailGround(tiles, biomes, col, row)).toBe(true)
      expect(x + w).toBeLessThanOrEqual((col + 1) * TILE)
      expect(y).toBeGreaterThanOrEqual(row * TILE - 2)
      expect(w).toBeGreaterThan(0)
      expect(h).toBeGreaterThan(0)
    }
    // Stalks stand on the tile's bottom row and stay inside it sideways.
    for (let i = 0; i < out.stalk.length; i += 4) {
      const x = out.stalk[i]!
      const bottom = out.stalk[i + 1]! + out.stalk[i + 3]!
      const row = Math.floor((bottom - 1) / TILE)
      expect(bottom).toBe(row * TILE + TILE - 1)
      expect(x + 1).toBeLessThanOrEqual(Math.floor(x / TILE) * TILE + TILE)
    }
  })

  it('is the same for the same grid', () => {
    const { tiles, biomes } = marsh()
    expect(buildCattailRects(tiles, biomes, W, H, 3, 4)).toEqual(buildCattailRects(tiles, biomes, W, H, 3, 4))
  })

  it('plants a clump on about one shore tile in three (two or three stalks each)', () => {
    const { tiles, biomes } = marsh()
    let shore = 0
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) if (isCattailGround(tiles, biomes, x, y)) shore++
    const stalks = buildCattailRects(tiles, biomes, W, H, 0, 0).stalk.length / 4
    // Two stalks or three per clump on a third of the shore: between 0.4 and 1.2 stalks a shore tile.
    expect(stalks / shore).toBeGreaterThan(0.4)
    expect(stalks / shore).toBeLessThan(1.2)
  })
})
