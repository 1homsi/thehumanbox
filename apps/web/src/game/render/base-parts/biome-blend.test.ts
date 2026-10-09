import { describe, expect, it } from 'vitest'
import { BIOME_RGBA } from '../../model/palette'
import { BIOME_ID, TILE_ID } from '../../model/terrain-ids'
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

describe('biome overlay blending', () => {
  it('a uniform biome keeps its own colour and alpha (the strength varies only slowly)', () => {
    const biomes = grid(W, H, () => BIOME_ID.FOREST)
    const out = new Float64Array(4)
    biomeOverlayAt(out, biomes, 5, 5)
    const [fr, fg, fb, fa] = BIOME_RGBA[BIOME_ID.FOREST]
    expect(out[0]).toBeCloseTo(fr, 6)
    expect(out[1]).toBeCloseTo(fg, 6)
    expect(out[2]).toBeCloseTo(fb, 6)
    expect(out[3]).toBeGreaterThanOrEqual(fa * 0.8 - 1e-9)
    expect(out[3]).toBeLessThanOrEqual(fa * 1.2 + 1e-9)
  })

  it('a cell next to a border takes a share of the other biome, the cell far away takes none', () => {
    const biomes = grid(W, H, (_r, c) => (c < EDGE ? BIOME_ID.GRASSLAND : BIOME_ID.FOREST))
    const grass = BIOME_RGBA[BIOME_ID.GRASSLAND]
    const forest = BIOME_RGBA[BIOME_ID.FOREST]
    const out = new Float64Array(4)

    biomeOverlayAt(out, biomes, 5, EDGE - 1)
    // Edge cell on the grassland side: its colour and alpha are a mix of the two biomes.
    expect(out[0]).toBeGreaterThan(Math.min(grass[0], forest[0]))
    expect(out[0]).toBeLessThan(Math.max(grass[0], forest[0]))
    expect(out[3]).toBeGreaterThan(Math.min(grass[3], forest[3]) * 0.8)
    expect(out[3]).toBeLessThan(Math.max(grass[3], forest[3]) * 1.2)

    biomeOverlayAt(out, biomes, 5, 1)
    expect(out[0]).toBeCloseTo(grass[0], 6)
    expect(out[1]).toBeCloseTo(grass[1], 6)
    expect(out[2]).toBeCloseTo(grass[2], 6)

    biomeOverlayAt(out, biomes, 5, EDGE + 2)
    expect(out[0]).toBeCloseTo(forest[0], 6)
    expect(out[2]).toBeCloseTo(forest[2], 6)
  })

  it('the step between two neighbouring cells across a border is smaller than the full change', () => {
    const biomes = grid(W, H, (_r, c) => (c < EDGE ? BIOME_ID.GRASSLAND : BIOME_ID.DESERT))
    const out = new Float64Array(4)
    const reds: number[] = []
    for (let c = 0; c < W; c++) {
      biomeOverlayAt(out, biomes, 5, c)
      reds.push(out[0])
    }
    const full = Math.abs(BIOME_RGBA[BIOME_ID.DESERT][0] - BIOME_RGBA[BIOME_ID.GRASSLAND][0])
    let worst = 0
    for (let c = 1; c < W; c++) worst = Math.max(worst, Math.abs(reds[c] - reds[c - 1]))
    expect(full).toBeGreaterThan(20)
    // A 3x3 kernel halves the sharpest step at most: the change spreads over the cells either side.
    expect(worst).toBeLessThan(full * 0.6)
  })

  it('the map border counts its own biome outside the grid, so the edge does not fade', () => {
    const biomes = grid(W, H, () => BIOME_ID.DESERT)
    const out = new Float64Array(4)
    biomeOverlayAt(out, biomes, 0, 0)
    expect(out[0]).toBeCloseTo(BIOME_RGBA[BIOME_ID.DESERT][0], 6)
  })

  it('a missing biome grid paints every land cell as grassland', () => {
    const out = new Float64Array(4)
    biomeOverlayAt(out, undefined, 3, 3)
    expect(out[0]).toBeCloseTo(BIOME_RGBA[BIOME_ID.GRASSLAND][0], 6)
    expect(out[3]).toBeGreaterThan(0)
  })
})

describe('tileColor with blended biomes', () => {
  it('a land cell at a biome border lands between the two biomes far from the border', () => {
    const tiles = grid(W, H, () => TILE_ID.GRASS)
    const biomes = grid(W, H, (_r, c) => (c < EDGE ? BIOME_ID.GRASSLAND : BIOME_ID.DESERT))
    const out = new Int32Array(4)
    const at = (col: number) => {
      tileColor(out, tiles, biomes, undefined, undefined, 5, col)
      return out[0]
    }
    const grassRed = at(1)
    const desertRed = at(EDGE + 2)
    const edgeRed = at(EDGE - 1)
    expect(desertRed).not.toBe(grassRed)
    expect(edgeRed).toBeGreaterThan(Math.min(grassRed, desertRed))
    expect(edgeRed).toBeLessThan(Math.max(grassRed, desertRed))
  })
})
