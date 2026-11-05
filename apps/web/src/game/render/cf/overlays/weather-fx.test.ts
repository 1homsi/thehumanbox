import { describe, expect, it } from 'vitest'
import { TILE } from '../../../model/palette'
import { TILE_ID } from '../../../model/terrain-ids'
import {
  STRIKE_SLOT_MS,
  boltPath,
  paintPuddles,
  paintSplashes,
  pixelPuddle,
  pixelRing,
  strikeAt,
  strikeEnvelope,
  unitHash,
} from './weather-fx'

const VIEW = { cx: 500, cy: 400, hw: 300, hh: 200 }

describe('lightning', () => {
  it('flashes at full strength right after a strike and is dark long after', () => {
    expect(strikeEnvelope(0)).toBe(1)
    expect(strikeEnvelope(30)).toBe(1)
    expect(strikeEnvelope(-1)).toBe(0)
    expect(strikeEnvelope(10_000)).toBe(0)
  })

  it('is deterministic and strikes inside the camera view', () => {
    let found = 0
    for (let t = 0; t < STRIKE_SLOT_MS * 40; t += 50) {
      const a = strikeAt(t, 1, VIEW)
      expect(strikeAt(t, 1, VIEW)).toEqual(a)
      if (a) {
        found++
        expect(Math.abs(a.x - VIEW.cx)).toBeLessThanOrEqual(VIEW.hw * 0.8 + 1e-9)
        expect(Math.abs(a.y - VIEW.cy)).toBeLessThanOrEqual(VIEW.hh * 0.7 + 1e-9)
      }
    }
    expect(found).toBeGreaterThan(0)
  })

  it('a stronger storm strikes more often', () => {
    const count = (intensity: number) => {
      let n = 0
      for (let t = 0; t < STRIKE_SLOT_MS * 200; t += 40) if (strikeAt(t, intensity, VIEW)) n++
      return n
    }
    expect(count(1)).toBeGreaterThan(count(0))
  })

  it('bolts run from the top of the view to the strike point', () => {
    const pts = boltPath(7, 100, 300, 50)
    expect(pts).toHaveLength(18)
    expect([pts[0], pts[1]]).toEqual([100, 50])
    expect([pts[16], pts[17]]).toEqual([100, 300])
  })
})

describe('unitHash', () => {
  it('stays in [0, 1) and is stable', () => {
    for (let i = 0; i < 200; i++) {
      const v = unitHash(i, i * 3)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
      expect(unitHash(i, i * 3)).toBe(v)
    }
  })
})

/** A context that records the rects drawn, and fails on any curve (arcs and ellipses are anti-aliased). */
function rectRecorder() {
  const rects: [number, number, number, number][] = []
  const ctx = {
    fillStyle: '',
    globalAlpha: 1,
    save() {},
    restore() {},
    fillRect: (x: number, y: number, w: number, h: number) => void rects.push([x, y, w, h]),
    beginPath: () => {
      throw new Error('drew a path, not whole pixels')
    },
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, rects }
}

const cells = (rects: readonly [number, number, number, number][]) => {
  const seen: string[] = []
  for (const [x, y, w, h] of rects)
    for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) seen.push(`${x + i},${y + j}`)
  return seen
}

describe('weather in whole pixels (#883)', () => {
  it('a ripple is a flat pixel oval whose rects never overlap, so its one tone stays even', () => {
    for (const r of [1, 2, 3, 4]) {
      const { ctx, rects } = rectRecorder()
      pixelRing(ctx, 10, 10, r)
      const drawn = cells(rects)
      expect(new Set(drawn).size).toBe(drawn.length)
      expect(drawn).toContain(`${10 - r},10`)
      expect(drawn).toContain(`${10 + r},10`)
      expect(drawn).not.toContain('10,10') // an outline, open in the middle
    }
  })

  it('a puddle is three bands on whole pixels that never overlap', () => {
    const { ctx, rects } = rectRecorder()
    pixelPuddle(ctx, 20, 20, 3)
    const drawn = cells(rects)
    expect(new Set(drawn).size).toBe(drawn.length)
    expect(drawn).toHaveLength(6 * 2 + 4 + 4)
    expect(rects.every((r) => r.every(Number.isInteger))).toBe(true)
  })

  it('splashes land on whole pixels and draw no curves', () => {
    const { ctx, rects } = rectRecorder()
    paintSplashes(ctx, { x0: 0.3, y0: 0.7, x1: 400.5, y1: 300.2 }, 12345, 1)
    expect(rects.length).toBeGreaterThan(0)
    expect(rects.every(([x, y]) => Number.isInteger(x) && Number.isInteger(y))).toBe(true)
  })

  it('puddles lie only on open ground, never on the sea, rock or snow', () => {
    const kinds = [TILE_ID.WATER, TILE_ID.GRASS, TILE_ID.ROCK, TILE_ID.SNOW, TILE_ID.SAND]
    const tiles = Array.from({ length: 40 }, () =>
      Array.from({ length: 50 }, (_, col) => kinds[col % kinds.length]),
    )
    const { ctx, rects } = rectRecorder()
    paintPuddles(ctx, tiles, { c0: 0, c1: 50, r0: 0, r1: 40, ox: 0, oy: 0 }, 1)
    expect(rects.length).toBeGreaterThan(0)
    // Each puddle's two-pixel middle band is centred on the puddle.
    const middles = rects.filter(([, , , h]) => h === 2)
    expect(middles.length).toBeGreaterThan(0)
    for (const [x, y, w] of middles) {
      const kind = tiles[Math.floor((y + 1) / TILE)][Math.floor((x + w / 2) / TILE)]
      expect([TILE_ID.GRASS, TILE_ID.SAND]).toContain(kind)
    }
  })
})
