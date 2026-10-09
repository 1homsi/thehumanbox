import { describe, expect, it } from 'vitest'
import { TILE } from '../../../model/palette'
import { TILE_ID } from '../../../model/terrain-ids'
import { isSnowed, paintGroundSnow, snowCover, type SnowView } from './ground-snow'

/** Counts the base squares and the specks painted. */
function recordingContext() {
  const log = { bases: 0, specks: 0 }
  const ctx = {
    save() {},
    restore() {},
    fillStyle: '',
    fillRect(_x: number, _y: number, w: number) {
      if (w === TILE) log.bases++
      else log.specks++
    },
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, log }
}

function grass(w: number, h: number): number[][] {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => TILE_ID.GRASS))
}

const VIEW: SnowView = { c0: 0, c1: 80, r0: 0, r1: 80, ox: 0, oy: 0 }

describe('snowCover', () => {
  it('lays no snow outside winter', () => {
    for (const season of ['recovery', 'abundance', 'decline']) {
      expect(snowCover(season, 0.9)).toBe(0)
    }
  })

  it('thickens through an ordinary winter, and a hard winter starts heavier', () => {
    expect(snowCover('scarcity', 0.9)).toBeGreaterThan(snowCover('scarcity', 0.1))
    expect(snowCover('hard_winter', 0.1)).toBeGreaterThan(snowCover('scarcity', 0.1))
  })

  it('stays in 0..1 for odd progress values', () => {
    for (const p of [-1, 0, 0.5, 1, 3, Number.NaN]) {
      const c = snowCover('hard_winter', p)
      expect(c).toBeGreaterThanOrEqual(0)
      expect(c).toBeLessThanOrEqual(1)
    }
  })
})

describe('isSnowed', () => {
  it('never snows on water, rock, snow or buildings, only on grass and food', () => {
    for (const tid of [TILE_ID.WATER, TILE_ID.ROCK, TILE_ID.SNOW, TILE_ID.HUT, TILE_ID.FLOODED]) {
      for (let r = 0; r < 20; r++) for (let c = 0; c < 20; c++) expect(isSnowed(tid, r, c, 1)).toBe(false)
    }
    let grassSnow = 0
    for (let r = 0; r < 20; r++)
      for (let c = 0; c < 20; c++) if (isSnowed(TILE_ID.GRASS, r, c, 0.5)) grassSnow++
    expect(grassSnow).toBeGreaterThan(0)
  })

  it('covers more of the land as the cover rises', () => {
    let low = 0
    let high = 0
    for (let r = 0; r < 60; r++) {
      for (let c = 0; c < 60; c++) {
        if (isSnowed(TILE_ID.GRASS, r, c, 0.15)) low++
        if (isSnowed(TILE_ID.GRASS, r, c, 0.7)) high++
      }
    }
    expect(high).toBeGreaterThan(low)
  })
})

describe('paintGroundSnow', () => {
  it('paints nothing in summer', () => {
    const { ctx, log } = recordingContext()
    paintGroundSnow(ctx, grass(80, 80), VIEW, 'abundance', 0.5)
    expect(log.bases + log.specks).toBe(0)
  })

  it('dusts the grass in winter, one base and a few specks per snowed cell', () => {
    const { ctx, log } = recordingContext()
    paintGroundSnow(ctx, grass(80, 80), VIEW, 'hard_winter', 0.5)
    expect(log.bases).toBeGreaterThan(0)
    expect(log.specks).toBeGreaterThan(log.bases)
  })

  it('shows less snow early in the winter than late in it', () => {
    const early = recordingContext()
    const late = recordingContext()
    paintGroundSnow(early.ctx, grass(80, 80), VIEW, 'scarcity', 0.05)
    paintGroundSnow(late.ctx, grass(80, 80), VIEW, 'scarcity', 0.95)
    expect(late.log.bases).toBeGreaterThan(early.log.bases)
  })

  it('uses the view offset, so snow lands on the same cells as the other ground layers', () => {
    const tiles = grass(40, 40)
    const offset: SnowView = { c0: 20, c1: 60, r0: 20, r1: 60, ox: 20, oy: 20 }
    const fills: number[] = []
    const ctx = {
      save() {},
      restore() {},
      fillStyle: '',
      fillRect(x: number, y: number, w: number) {
        if (w === TILE) fills.push(x, y)
      },
    } as unknown as CanvasRenderingContext2D
    paintGroundSnow(ctx, tiles, offset, 'hard_winter', 0.5)
    expect(fills.length).toBeGreaterThan(0)
    for (let i = 0; i < fills.length; i += 2) {
      expect(fills[i]).toBeGreaterThanOrEqual(0)
      expect(fills[i]).toBeLessThan(40 * TILE)
    }
  })
})
