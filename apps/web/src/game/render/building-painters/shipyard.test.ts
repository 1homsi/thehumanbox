import { describe, expect, it, vi } from 'vitest'
import { hasBuildingSprite } from './registry'
import type { P } from './kit'
import { paintShipyard } from './shipyard'

/** A canvas context stand-in that records every pixel fill. */
function recorder() {
  const pixels: Array<{ x: number; y: number; color: string }> = []
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    fillRect: vi.fn((x: number, y: number, w: number, h: number) => {
      for (let i = 0; i < w; i++)
        for (let j = 0; j < h; j++) pixels.push({ x: x + i, y: y + j, color: ctx.fillStyle })
    }),
    strokeRect: vi.fn(),
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, pixels }
}

/** A 3x2 shipyard: 24 px wide, its base at y 42. */
function paint(state: string) {
  const { ctx, pixels } = recorder()
  const p: P = {
    ctx,
    x0: 8,
    y1: 42,
    w: 24,
    h: 28,
    rng: () => 0.5,
    night: 0,
    cond: 1,
    kind: 'Shipyard',
    variant: 0,
    tier: 1,
    state,
  }
  paintShipyard(p)
  const count = (c: string) => pixels.filter((q) => q.color === c).length
  return { planks: count('#c59a5e'), keel: count('#8a6440'), frames: count('#5a4028') }
}

describe('paintShipyard', () => {
  it('is registered for shipyards', () => {
    expect(hasBuildingSprite('Shipyard')).toBe(true)
  })

  it('draws no hull while the slip is empty', () => {
    expect(paint('')).toMatchObject({ planks: 0, keel: 0 })
  })

  it('lays a keel, raises its ribs, then planks the hull', () => {
    const keel = paint('hull1')
    const ribs = paint('hull2')
    const planked = paint('hull3')
    expect(keel.keel).toBeGreaterThan(0)
    expect(keel.planks).toBe(0)
    expect(ribs.keel).toBe(keel.keel)
    expect(ribs.planks).toBe(0)
    expect(ribs.frames).toBeGreaterThan(keel.frames)
    expect(planked.planks).toBeGreaterThan(0)
  })
})
