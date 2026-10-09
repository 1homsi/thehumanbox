import { describe, expect, it } from 'vitest'
import { TILE } from '../../../model/palette'
import type { CfFrame } from './frame'
import { paintEffects } from './paint-effects'

/** A context that counts the rectangles it is asked to fill (a festival draws about sixty). */
function rectCounter() {
  let rects = 0
  const ctx = {
    save() {},
    restore() {},
    beginPath() {},
    fill() {},
    stroke() {},
    fillRect() {
      rects++
    },
    strokeRect() {},
    fillText() {},
    measureText: () => ({ width: 10 }),
    arc() {},
    ellipse() {},
    fillStyle: '',
    strokeStyle: '',
    globalAlpha: 1,
    font: '',
    textAlign: '',
    textBaseline: '',
    lineWidth: 1,
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, rects: () => rects }
}

/** A frame with one festival at tile (x, y), the camera at the origin of a 400-tile world, close zoom. */
function frameWithFestival(x: number, y: number): CfFrame {
  return {
    W: 400 * TILE,
    H: 400 * TILE,
    zoom: 3,
    cam: { x: 40 * TILE, y: 40 * TILE },
    viewport: { w: 1280, h: 800 },
    ox: 0,
    oy: 0,
    t: 5000,
    organisms: [],
    world: {
      tick: 100,
      grid: { width: 400, height: 400 },
      festivals: [{ x, y, started: 90, ends: 200, lineage_id: 'a', name: 'Feast' }],
    },
  } as unknown as CfFrame
}

describe('paintEffects culls what is off screen', () => {
  it('draws a festival that is in view', () => {
    const { ctx, rects } = rectCounter()
    paintEffects(ctx, frameWithFestival(42, 42))
    expect(rects()).toBeGreaterThan(0)
  })

  it('does not draw a festival far off the screen', () => {
    const { ctx, rects } = rectCounter()
    paintEffects(ctx, frameWithFestival(300, 300))
    expect(rects()).toBe(0)
  })
})
