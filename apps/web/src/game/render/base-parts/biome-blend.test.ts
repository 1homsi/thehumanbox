import { describe, expect, it } from 'vitest'
import { BIOME_RGBA } from '../../model/palette'
import { BIOME_ID, TILE_ID } from '../../model/terrain-ids'
import { FRESH_WATER } from '../art-palette'
import { OCEAN_BANDS, seaBandAt } from '../landscape-style'
import { biomeOverlayAt, tileColor } from './tile-paint'

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
const EDGE = 8 // biome changes from grassland (col < EDGE) to forest (col >= EDGE)

describe('biome overlay', () => {
  it('a cell takes its own biome colour and alpha, flat', () => {
    const biomes = grid(W, H, () => BIOME_ID.FOREST)
    const out = new Float64Array(4)
    biomeOverlayAt(out, biomes, 5, 5)
    expect(Array.from(out)).toEqual(BIOME_RGBA[BIOME_ID.FOREST])
  })

  it('a cell next to a border keeps its own biome: the edge is made ragged by the fringe, not blurred', () => {
    const biomes = grid(W, H, (_r, c) => (c < EDGE ? BIOME_ID.GRASSLAND : BIOME_ID.FOREST))
    const out = new Float64Array(4)
    biomeOverlayAt(out, biomes, 5, EDGE - 1)
    expect(Array.from(out)).toEqual(BIOME_RGBA[BIOME_ID.GRASSLAND])
    biomeOverlayAt(out, biomes, 5, EDGE)
    expect(Array.from(out)).toEqual(BIOME_RGBA[BIOME_ID.FOREST])
  })

  it('a missing biome grid paints every land cell as grassland', () => {
    const out = new Float64Array(4)
    biomeOverlayAt(out, undefined, 3, 3)
    expect(out[0]).toBeCloseTo(BIOME_RGBA[BIOME_ID.GRASSLAND][0], 6)
    expect(out[3]).toBeGreaterThan(0)
  })
})

describe('tileColor across a biome border', () => {
  it('changes in one step at the border, with no shades in between', () => {
    const tiles = grid(W, H, () => TILE_ID.GRASS)
    const biomes = grid(W, H, (_r, c) => (c < EDGE ? BIOME_ID.GRASSLAND : BIOME_ID.DESERT))
    const out = new Int32Array(4)
    const at = (col: number) => {
      tileColor(out, tiles, biomes, undefined, undefined, 5, col)
      return out[0]
    }
    expect(at(EDGE - 1)).toBe(at(EDGE - 3))
    expect(at(EDGE)).toBe(at(EDGE + 2))
    expect(at(EDGE)).not.toBe(at(EDGE - 1))
  })
})

describe('ground and water colours', () => {
  const out = new Int32Array(4)

  it('fills sea with its flat chart band and rivers with fresh water, with no texture shading', () => {
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

  it('keeps grass olive, never lime, in every season', () => {
    const tiles = grid(W, H, () => TILE_ID.GRASS)
    const biomes = grid(W, H, () => BIOME_ID.GRASSLAND)
    for (const season of ['recovery', 'abundance', 'decline', 'scarcity', 'hard_winter']) {
      for (let col = 0; col < W; col++) {
        tileColor(out, tiles, biomes, undefined, season, 5, col)
        const [r, g] = [out[0] + out[3], out[1] + out[3]]
        expect(g - r).toBeLessThan(30)
      }
    }
  })

  it('keeps every biome distinguishable from the others', () => {
    const biomeIds = Object.values(BIOME_ID)
    const colours = biomeIds.map((biome) => {
      const tiles = grid(W, H, () => (biome === BIOME_ID.DESERT ? TILE_ID.SAND : TILE_ID.GRASS))
      const biomes = grid(W, H, () => biome)
      tileColor(out, tiles, biomes, undefined, 'abundance', 5, 5)
      return [out[0], out[1], out[2]]
    })
    for (let a = 0; a < colours.length; a++)
      for (let b = a + 1; b < colours.length; b++) {
        const d = Math.hypot(...colours[a].map((c, i) => c - colours[b][i]))
        expect(d, `${biomeIds[a]} vs ${biomeIds[b]}`).toBeGreaterThan(12)
      }
  })
})
