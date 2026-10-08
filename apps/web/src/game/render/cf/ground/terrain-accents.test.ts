import { describe, expect, it } from 'vitest'
import { TILE } from '../../../model/palette'
import { BIOME_ID, TILE_ID } from '../../../model/terrain-ids'
import { buildAccentRects, isDuneTile, isLavaTile } from './terrain-accents'

const W = 40
const H = 40

function grid(fill: number): number[][] {
  return Array.from({ length: H }, () => Array.from({ length: W }, () => fill))
}

describe('tile classes', () => {
  it('treats sand and desert land as dunes, and not water or snow', () => {
    expect(isDuneTile(TILE_ID.SAND, BIOME_ID.GRASSLAND)).toBe(true)
    expect(isDuneTile(TILE_ID.GRASS, BIOME_ID.DESERT)).toBe(true)
    expect(isDuneTile(TILE_ID.WATER, BIOME_ID.DESERT)).toBe(false)
    expect(isDuneTile(TILE_ID.SNOW, BIOME_ID.DESERT)).toBe(false)
    expect(isDuneTile(TILE_ID.GRASS, BIOME_ID.GRASSLAND)).toBe(false)
  })

  it('treats volcanic ground as lava country, except water and snow', () => {
    expect(isLavaTile(TILE_ID.ASH, BIOME_ID.VOLCANIC)).toBe(true)
    expect(isLavaTile(TILE_ID.ROCK, BIOME_ID.VOLCANIC)).toBe(true)
    expect(isLavaTile(TILE_ID.WATER, BIOME_ID.VOLCANIC)).toBe(false)
    expect(isLavaTile(TILE_ID.ASH, BIOME_ID.GRASSLAND)).toBe(false)
  })
})

describe('buildAccentRects', () => {
  it('draws nothing without a biome grid', () => {
    const out = buildAccentRects(grid(TILE_ID.SAND), undefined, W, H)
    expect(out.crest).toHaveLength(0)
    expect(out.shade).toHaveLength(0)
    expect(out.lava.every((b) => b.length === 0)).toBe(true)
  })

  it('puts a dune shade under every crest, four numbers per mark', () => {
    const out = buildAccentRects(grid(TILE_ID.SAND), grid(BIOME_ID.DESERT), W, H)
    expect(out.crest.length).toBeGreaterThan(0)
    expect(out.crest.length % 4).toBe(0)
    expect(out.shade.length).toBe(out.crest.length)
    for (let i = 0; i < out.crest.length; i += 4) expect(out.shade[i + 1]).toBe(out.crest[i + 1] + 2)
  })

  it('places lava veins only on volcanic ground', () => {
    const out = buildAccentRects(grid(TILE_ID.ASH), grid(BIOME_ID.VOLCANIC), W, H)
    const lava = out.lava.reduce((n, b) => n + b.length, 0)
    expect(lava).toBeGreaterThan(0)
    const none = buildAccentRects(grid(TILE_ID.ASH), grid(BIOME_ID.GRASSLAND), W, H)
    expect(none.lava.every((b) => b.length === 0)).toBe(true)
  })

  it('is the same for the same grid', () => {
    const a = buildAccentRects(grid(TILE_ID.SAND), grid(BIOME_ID.DESERT), W, H)
    const b = buildAccentRects(grid(TILE_ID.SAND), grid(BIOME_ID.DESERT), W, H)
    expect(a).toEqual(b)
  })

  it('keeps every mark finite and inside its own tile', () => {
    const out = buildAccentRects(grid(TILE_ID.SAND), grid(BIOME_ID.DESERT), W, H)
    const all = [...out.crest, ...out.shade, ...out.lava.flat()]
    expect(all.length).toBeGreaterThan(0)
    for (let i = 0; i < all.length; i += 4) {
      const [x, y, w, h] = [all[i], all[i + 1], all[i + 2], all[i + 3]]
      expect(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(w) && Number.isFinite(h)).toBe(true)
      expect(w).toBeGreaterThan(0)
      expect(h).toBeGreaterThan(0)
      const col = Math.floor(x / TILE)
      const row = Math.floor(y / TILE)
      expect(col).toBeGreaterThanOrEqual(0)
      expect(col).toBeLessThan(W)
      expect(row).toBeGreaterThanOrEqual(0)
      expect(row).toBeLessThan(H)
      // A mark stays within the tile it starts in (crests may end at the tile edge).
      expect(x + w).toBeLessThanOrEqual((col + 1) * TILE + 1e-9)
    }
  })
})
