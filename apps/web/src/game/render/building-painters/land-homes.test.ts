import { describe, expect, it, vi } from 'vitest'
import { BIOME_ID } from '../../model/terrain-ids'
import type { P } from './kit'
import { homeLandOfBiome, paintLandHome } from './land-homes'

/** A canvas context stand-in that records every single-pixel fill. */
function recorder() {
  const pixels: Array<{ x: number; y: number; color: string }> = []
  const ctx = {
    fillStyle: '',
    fillRect: vi.fn((x: number, y: number, w: number, h: number) => {
      if (w === 1 && h === 1) pixels.push({ x, y, color: ctx.fillStyle })
    }),
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, pixels }
}

const home = (land: string, ctx: CanvasRenderingContext2D): P => ({
  ctx,
  x0: 8,
  y1: 34,
  w: 8,
  h: 19.7,
  rng: () => 0.5,
  night: 0,
  cond: 1,
  kind: 'Hut',
  variant: 0,
  tier: 0,
  state: '',
  land,
})

describe('homeLandOfBiome', () => {
  it('gives each cold biome an igloo and each dry biome an adobe hut', () => {
    expect(homeLandOfBiome(BIOME_ID.TUNDRA)).toBe('snow')
    expect(homeLandOfBiome(BIOME_ID.TAIGA)).toBe('snow')
    expect(homeLandOfBiome(BIOME_ID.DESERT)).toBe('adobe')
    expect(homeLandOfBiome(BIOME_ID.BADLANDS)).toBe('adobe')
  })

  it('builds stilt houses over wetland and longhouses in forest and jungle', () => {
    expect(homeLandOfBiome(BIOME_ID.WETLAND)).toBe('stilt')
    expect(homeLandOfBiome(BIOME_ID.FOREST)).toBe('longhouse')
    expect(homeLandOfBiome(BIOME_ID.JUNGLE)).toBe('longhouse')
  })

  it('keeps the default hut on grassland, savanna and volcanic ground', () => {
    expect(homeLandOfBiome(BIOME_ID.GRASSLAND)).toBe('')
    expect(homeLandOfBiome(BIOME_ID.SAVANNA)).toBe('')
    expect(homeLandOfBiome(BIOME_ID.VOLCANIC)).toBe('')
  })
})

describe('paintLandHome', () => {
  it('declines a home with no land style so the default hut paints', () => {
    const { ctx, pixels } = recorder()
    expect(paintLandHome(home('', ctx))).toBe(false)
    expect(pixels).toHaveLength(0)
  })

  it('paints each land style above the stilts and within the tile column', () => {
    for (const land of ['snow', 'adobe', 'stilt', 'longhouse'] as const) {
      const { ctx, pixels } = recorder()
      expect(paintLandHome(home(land, ctx))).toBe(true)
      expect(pixels.length).toBeGreaterThan(20)
      expect(Math.min(...pixels.map((p) => p.x))).toBeGreaterThanOrEqual(7)
      expect(Math.max(...pixels.map((p) => p.x))).toBeLessThanOrEqual(17)
      // The house stands on the tile's bottom edge; only stilt legs reach into the water below.
      expect(Math.max(...pixels.map((p) => p.y))).toBeLessThanOrEqual(34 + 2)
    }
  })

  it('gives each land style its own pixels', () => {
    const look = (land: string) => {
      const { ctx, pixels } = recorder()
      paintLandHome(home(land, ctx))
      return pixels.map((p) => `${p.x},${p.y},${p.color}`).join(';')
    }
    const looks = ['snow', 'adobe', 'stilt', 'longhouse'].map(look)
    expect(new Set(looks).size).toBe(4)
  })
})
