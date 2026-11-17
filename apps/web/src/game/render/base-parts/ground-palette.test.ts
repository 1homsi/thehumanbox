import { describe, expect, it } from 'vitest'
import { BIOME_ID, TILE_ID } from '../../model/terrain-ids'
import { FRESH_WATER } from '../art-palette'
import { OCEAN_BANDS, seaBandAt } from '../landscape-style'
import { PALETTE_RGB } from '../pixel-art/palette.ts'
import { groundTone } from './ground-palette'
import { tileColor } from './tile-paint'

function grid(w: number, h: number, value: (row: number, col: number) => number): number[][] {
  const out: number[][] = []
  for (let r = 0; r < h; r++) {
    const row: number[] = []
    for (let c = 0; c < w; c++) row.push(value(r, c))
    out.push(row)
  }
  return out
}

const W = 16
const H = 12
const EDGE = 8 // biome changes from grassland (col < EDGE) to desert (col >= EDGE)
const SEASONS = [undefined, 'recovery', 'abundance', 'decline', 'scarcity', 'hard_winter']
const onPalette = (rgb: readonly number[]) =>
  PALETTE_RGB.some((p, i) => i > 0 && p[0] === rgb[0] && p[1] === rgb[1] && p[2] === rgb[2])

describe('the ground', () => {
  it('is always a colour of the master palette: every tile, biome, season and patch', () => {
    for (const tile of Object.values(TILE_ID))
      for (const biome of Object.values(BIOME_ID))
        for (const season of SEASONS)
          for (const patch of [false, true])
            expect(onPalette(groundTone(tile, biome, season, patch)), `${tile}/${biome}/${season}`).toBe(true)
  })

  it('keeps every biome distinguishable from the others', () => {
    const biomeIds = Object.values(BIOME_ID)
    const colours = biomeIds.map((biome) => groundTone(TILE_ID.GRASS, biome, 'abundance', false))
    for (let a = 0; a < colours.length; a++)
      for (let b = a + 1; b < colours.length; b++) {
        const d = Math.hypot(...colours[a].map((c, i) => c - colours[b][i]))
        expect(d, `${biomeIds[a]} vs ${biomeIds[b]}`).toBeGreaterThan(12)
      }
  })

  it('yellows open grass in autumn, pales it in winter and frosts it in a hard winter', () => {
    const summer = groundTone(TILE_ID.GRASS, BIOME_ID.GRASSLAND, 'abundance', false)
    const looks = ['decline', 'scarcity', 'hard_winter'].map((s) =>
      groundTone(TILE_ID.GRASS, BIOME_ID.GRASSLAND, s, false).join(),
    )
    expect(new Set([summer.join(), ...looks]).size).toBe(4)
    // Sand, rock and snow do not have seasons.
    for (const tile of [TILE_ID.SAND, TILE_ID.ROCK, TILE_ID.SNOW])
      expect(groundTone(tile, BIOME_ID.GRASSLAND, 'hard_winter', false)).toBe(
        groundTone(tile, BIOME_ID.GRASSLAND, 'abundance', false),
      )
  })
})

describe('tileColor', () => {
  const out = new Int32Array(4)

  it('changes in one step at a biome border, with no shades in between', () => {
    const tiles = grid(W, H, () => TILE_ID.GRASS)
    const biomes = grid(W, H, (_r, c) => (c < EDGE ? BIOME_ID.FOREST : BIOME_ID.DESERT))
    const at = (col: number) => {
      tileColor(out, tiles, biomes, undefined, undefined, 5, col)
      return `${out[0]},${out[1]},${out[2]}`
    }
    expect(at(EDGE - 1)).toBe(at(EDGE - 3))
    expect(at(EDGE)).toBe(at(EDGE + 2))
    expect(at(EDGE)).not.toBe(at(EDGE - 1))
  })

  it('paints land in palette colours with no shade of noise, across a whole field', () => {
    const tiles = grid(64, 64, () => TILE_ID.GRASS)
    const biomes = grid(64, 64, () => BIOME_ID.GRASSLAND)
    const seen = new Set<string>()
    for (let row = 0; row < 64; row++)
      for (let col = 0; col < 64; col++) {
        tileColor(out, tiles, biomes, undefined, 'abundance', row, col)
        expect(out[3]).toBe(0)
        seen.add(`${out[0]},${out[1]},${out[2]}`)
      }
    // The grass and its patches: two flat tones, not a tone per tile.
    expect(seen.size).toBeLessThanOrEqual(2)
    for (const c of seen) expect(onPalette(c.split(',').map(Number))).toBe(true)
  })

  it('paints a missing biome grid as grassland', () => {
    const tiles = grid(W, H, () => TILE_ID.GRASS)
    tileColor(out, tiles, undefined, undefined, 'abundance', 3, 3)
    const patch = [
      groundTone(TILE_ID.GRASS, BIOME_ID.GRASSLAND, 'abundance', false),
      groundTone(TILE_ID.GRASS, BIOME_ID.GRASSLAND, 'abundance', true),
    ]
    expect(patch.map((p) => p.join())).toContain(`${out[0]},${out[1]},${out[2]}`)
  })

  it('fills sea with its flat chart band and rivers with fresh water', () => {
    const tiles = grid(W, H, (_r, c) => (c === 3 ? TILE_ID.GRASS : TILE_ID.WATER))
    const depth = grid(W, H, (_r, c) => (c < 3 ? 184 : 200 - c))
    // On the bank, and in the open water of the river.
    tileColor(out, tiles, undefined, depth, undefined, 6, 2)
    expect([out[0], out[1], out[2]]).toEqual([...FRESH_WATER.mid])
    tileColor(out, tiles, undefined, depth, undefined, 6, 1)
    expect([out[0], out[1], out[2]]).toEqual([...FRESH_WATER.deep])
    expect(out[3]).toBe(0)
    tileColor(out, tiles, undefined, depth, undefined, 6, 8)
    expect([out[0], out[1], out[2]]).toEqual([...OCEAN_BANDS[seaBandAt(tiles, depth, 6, 8)]])
    expect(out[3]).toBe(0)
  })
})
