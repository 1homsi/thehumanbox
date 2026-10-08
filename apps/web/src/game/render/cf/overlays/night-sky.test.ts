import { describe, expect, it } from 'vitest'
import { moonLight, nightLevel, paintMoon, paintStars } from './night-sky'

/** A canvas context that records the rectangles it fills and the colour and alpha at each. */
function recorder() {
  const rects: Array<{ x: number; y: number; w: number; h: number; fill: string; alpha: number }> = []
  const ctx = {
    fillStyle: '#000',
    globalAlpha: 1,
    save() {},
    restore() {},
    fillRect(x: number, y: number, w: number, h: number) {
      rects.push({ x, y, w, h, fill: this.fillStyle, alpha: this.globalAlpha })
    },
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, rects }
}

describe('night level and moon light', () => {
  it('is night when the sun is down and nothing else', () => {
    expect(nightLevel({ is_day: false })).toBe(1)
    expect(nightLevel({ is_day: true })).toBe(0)
  })

  it('lights the right side while waxing and the left while waning', () => {
    expect(moonLight('waxing_gibbous', 0.8)).toEqual({ lit: 0.8, waxing: true })
    expect(moonLight('first_quarter', 0.5).waxing).toBe(true)
    expect(moonLight('waning_crescent', 0.1).waxing).toBe(false)
    expect(moonLight('full_moon', 1).lit).toBe(1)
    expect(moonLight('new_moon', 0).lit).toBe(0)
  })

  it('clamps the lit fraction', () => {
    expect(moonLight('full_moon', 3).lit).toBe(1)
    expect(moonLight(undefined, undefined).lit).toBe(0.5)
  })
})

describe('paintStars', () => {
  const bounds = { c0: 0, c1: 60, r0: 0, r1: 40 }

  it('draws nothing in daylight', () => {
    const { ctx, rects } = recorder()
    paintStars(ctx, bounds, 0, 0, 1000, 0)
    expect(rects).toHaveLength(0)
  })

  it('draws the same stars at night for the same clock', () => {
    const a = recorder()
    const b = recorder()
    paintStars(a.ctx, bounds, 0, 0, 5000, 1)
    paintStars(b.ctx, bounds, 0, 0, 5000, 1)
    expect(a.rects.length).toBeGreaterThan(0)
    expect(a.rects.map((r) => [r.x, r.y])).toEqual(b.rects.map((r) => [r.x, r.y]))
    // A few per cell at most: about a third of the cells hold one.
    expect(a.rects.length).toBeLessThan(60)
  })
})

describe('paintMoon', () => {
  it('is all dark at a new moon and all bright at full', () => {
    const dark = recorder()
    paintMoon(dark.ctx, 0, 0, 10, { lit: 0, waxing: true })
    expect(dark.rects.every((r) => r.fill === '#262e40')).toBe(true)

    const full = recorder()
    paintMoon(full.ctx, 0, 0, 10, { lit: 1, waxing: true })
    const bright = full.rects.filter((r) => r.fill === '#f3ecd2')
    expect(bright.length).toBeGreaterThan(0)
    // At full, the lit span covers each row's whole half-width.
    for (const r of bright) expect(r.x).toBeLessThan(0)
  })

  it('lights the right half for a waxing moon at half phase', () => {
    const half = recorder()
    paintMoon(half.ctx, 0, 0, 10, { lit: 0.5, waxing: true })
    const bright = half.rects.filter((r) => r.fill === '#f3ecd2')
    expect(bright.length).toBeGreaterThan(0)
    for (const r of bright) expect(r.x).toBeGreaterThanOrEqual(-1e-9)
  })
})
