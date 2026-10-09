import { describe, expect, it, vi } from 'vitest'
import { hasBuildingSprite } from './registry'
import type { P } from './kit'
import { paintWorkshop } from './workshop'

/** A canvas context stand-in that records every single-pixel fill. */
function recorder() {
  const pixels: Array<{ x: number; y: number; color: string }> = []
  const ctx = {
    fillStyle: '',
    fillRect: vi.fn((x: number, y: number, w: number, h: number) => {
      for (let i = 0; i < w; i++)
        for (let j = 0; j < h; j++) pixels.push({ x: x + i, y: y + j, color: ctx.fillStyle })
    }),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, pixels }
}

/** A two-tile workshop: 16 px wide, 16 px tall, its base at y 42. */
const workshop = (tier: number, ctx: CanvasRenderingContext2D): P => ({
  ctx,
  x0: 8,
  y1: 42,
  w: 16,
  h: 27.7,
  rng: () => 0.5,
  night: 0,
  cond: 1,
  kind: 'Workshop',
  variant: 0,
  tier,
  state: '',
})

describe('paintWorkshop', () => {
  it('is registered for workshops', () => {
    expect(hasBuildingSprite('Workshop')).toBe(true)
  })

  it('paints an open stone-age lean-to: thatch, posts, logs and a stone heap', () => {
    const { ctx, pixels } = recorder()
    paintWorkshop(workshop(0, ctx))
    const colours = new Set(pixels.map((p) => p.color))
    expect(colours.has('#d8bc6a')).toBe(true)
    expect(colours.has('#7a5230')).toBe(true)
    expect(colours.has('#9c9a92')).toBe(true)
    // Everything stays on the two-tile footprint, with a little eave over the edges.
    expect(Math.min(...pixels.map((p) => p.x))).toBeGreaterThanOrEqual(7)
    expect(Math.max(...pixels.map((p) => p.x))).toBeLessThanOrEqual(25)
  })

  it('hands later eras to the cottage painter, which draws no stone heap', () => {
    const { ctx, pixels } = recorder()
    paintWorkshop(workshop(2, ctx))
    expect(pixels.some((p) => p.color === '#9c9a92')).toBe(false)
  })
})
