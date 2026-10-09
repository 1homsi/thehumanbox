import { describe, expect, it } from 'vitest'
import { TILE } from '../../../model/palette'
import { BIOME_ID, TILE_ID } from '../../../model/terrain-ids'
import { PUFFS, VENT_LIMIT, findVents, isVent, paintEruption, plumePuff, type VentView } from './eruption'

/** Records the circles drawn, the gradients made and the specks painted. */
function recordingContext() {
  const log = { arcs: 0, gradients: 0, specks: 0 }
  const ctx = {
    save() {},
    restore() {},
    globalAlpha: 1,
    fillStyle: '' as unknown,
    beginPath() {},
    fill() {},
    arc() {
      log.arcs++
    },
    fillRect() {
      log.specks++
    },
    createRadialGradient() {
      log.gradients++
      return { addColorStop() {} }
    },
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, log }
}

/** A grid of volcanic rock, every cell in the volcanic biome. */
function volcanic(w: number, h: number): { tiles: number[][]; biomes: number[][] } {
  const tiles: number[][] = []
  const biomes: number[][] = []
  for (let r = 0; r < h; r++) {
    tiles.push(Array.from({ length: w }, () => TILE_ID.ROCK))
    biomes.push(Array.from({ length: w }, () => BIOME_ID.VOLCANIC))
  }
  return { tiles, biomes }
}

const VIEW: VentView = { c0: 0, c1: 200, r0: 0, r1: 200, ox: 0, oy: 0 }

describe('isVent', () => {
  it('only opens vents on volcanic ground, and never in water or snow', () => {
    let vents = 0
    for (let r = 0; r < 60; r++)
      for (let c = 0; c < 60; c++) if (isVent(TILE_ID.ROCK, BIOME_ID.GRASSLAND, r, c)) vents++
    expect(vents).toBe(0)
    for (let r = 0; r < 60; r++) {
      for (let c = 0; c < 60; c++) {
        expect(isVent(TILE_ID.WATER, BIOME_ID.VOLCANIC, r, c)).toBe(false)
        expect(isVent(TILE_ID.SNOW, BIOME_ID.VOLCANIC, r, c)).toBe(false)
      }
    }
  })

  it('makes a sparse scatter: a few cells in every hundred on volcanic ground', () => {
    let vents = 0
    const n = 100 * 100
    for (let r = 0; r < 100; r++)
      for (let c = 0; c < 100; c++) if (isVent(TILE_ID.ROCK, BIOME_ID.VOLCANIC, r, c)) vents++
    expect(vents / n).toBeGreaterThan(0.01)
    expect(vents / n).toBeLessThan(0.08)
  })
})

describe('findVents', () => {
  it('finds nothing without both grids', () => {
    expect(findVents(undefined, undefined, VIEW)).toEqual([])
  })

  it('caps the number of vents in one view', () => {
    const { tiles, biomes } = volcanic(300, 300)
    expect(findVents(tiles, biomes, { ...VIEW, c1: 300, r1: 300 }).length).toBe(VENT_LIMIT)
  })

  it('only looks inside the window', () => {
    const { tiles, biomes } = volcanic(120, 120)
    const found = findVents(tiles, biomes, { c0: 10, c1: 20, r0: 10, r1: 20, ox: 0, oy: 0 })
    for (const v of found) {
      expect(v.col).toBeGreaterThanOrEqual(10)
      expect(v.col).toBeLessThan(20)
      expect(v.row).toBeGreaterThanOrEqual(10)
      expect(v.row).toBeLessThan(20)
    }
  })
})

describe('plumePuff', () => {
  it('rises, spreads and thins as it climbs, and is never more opaque than its cap', () => {
    for (let t = 0; t < 6000; t += 97) {
      const p = plumePuff(100, 200, 3, 1, t)
      expect(p.a).toBeGreaterThanOrEqual(0)
      expect(p.a).toBeLessThanOrEqual(0.5)
    }
    // Over the same puff's rise, it climbs and grows: take two moments on one cycle.
    const early = plumePuff(100, 200, 3, 0, 0)
    const later = plumePuff(100, 200, 3, 0, 1000)
    expect(later.y).not.toBe(early.y)
    expect(later.r).not.toBe(early.r)
  })

  it('starts each puff in its mouth area, not far away', () => {
    const p = plumePuff(50, 80, 1, 2, 123)
    expect(Math.abs(p.x - 50)).toBeLessThan(TILE * 3)
    expect(p.y).toBeLessThanOrEqual(80)
  })
})

describe('paintEruption', () => {
  it('paints a glow, a column of puffs and ash for each vent in the view', () => {
    const { tiles, biomes } = volcanic(120, 120)
    const vents = findVents(tiles, biomes, { c0: 0, c1: 120, r0: 0, r1: 120, ox: 0, oy: 0 })
    expect(vents.length).toBeGreaterThan(0)
    const { ctx, log } = recordingContext()
    paintEruption(ctx, tiles, biomes, { c0: 0, c1: 120, r0: 0, r1: 120, ox: 0, oy: 0 }, 500, false)
    expect(log.gradients).toBe(vents.length)
    // A mouth and up to PUFFS puffs (a puff that has thinned to nothing is skipped).
    expect(log.arcs).toBeLessThanOrEqual(vents.length * (1 + PUFFS))
    expect(log.arcs).toBeGreaterThan(vents.length)
    expect(log.specks).toBeGreaterThan(0)
  })

  it('draws nothing where there is no volcanic ground', () => {
    const tiles = volcanic(40, 40).tiles
    const biomes = Array.from({ length: 40 }, () => Array.from({ length: 40 }, () => BIOME_ID.GRASSLAND))
    const { ctx, log } = recordingContext()
    paintEruption(ctx, tiles, biomes, { c0: 0, c1: 40, r0: 0, r1: 40, ox: 0, oy: 0 }, 500, true)
    expect(log.arcs + log.gradients + log.specks).toBe(0)
  })
})
