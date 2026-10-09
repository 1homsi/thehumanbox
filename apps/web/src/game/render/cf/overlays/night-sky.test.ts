import { describe, expect, it } from 'vitest'
import { nightLevel, paintStars } from './night-sky'

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

describe('night level', () => {
  it('is night when the sun is down and nothing else', () => {
    expect(nightLevel({ is_day: false })).toBe(1)
    expect(nightLevel({ is_day: true })).toBe(0)
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
