import { describe, expect, it, vi } from 'vitest'
import type { P } from './kit'
import { mulberry32 } from './kit'
import { paintTemple } from './civic'

/** A canvas context stand-in that records the colour of every pixel it fills. */
function recorder() {
  const pixels = new Map<string, string>()
  // Every colour a path or rectangle was filled with, as well as the pixels of rectangles.
  const filled = new Set<string>()
  const ctx = {
    fillStyle: '',
    fillRect: vi.fn((x: number, y: number, w: number, h: number) => {
      filled.add(String(ctx.fillStyle))
      for (let i = 0; i < w; i++)
        for (let j = 0; j < h; j++) pixels.set(`${x + i},${y + j}`, String(ctx.fillStyle))
    }),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(() => filled.add(String(ctx.fillStyle))),
    stroke: vi.fn(),
  }
  return {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    colours: () => new Set([...pixels.values(), ...filled]),
    colourAt: (x: number, y: number) => pixels.get(`${x},${y}`),
  }
}

/** A temple one tile wide and two tall, as the sprite lays it out. */
function temple(ctx: CanvasRenderingContext2D, tier: number): P {
  return {
    ctx,
    x0: 8,
    y1: 28,
    w: 16,
    h: 28,
    rng: mulberry32(11),
    night: 0,
    cond: 1,
    kind: 'Temple',
    variant: 0,
    tier,
    state: '',
  }
}

const COLUMN = '#d8cfb8'
const PLANK = '#9a7040'
const SPIRE = '#8a8298'

describe('temple painter', () => {
  it('a bronze or stone-age temple is a timber hall with planks, not a stone colonnade', () => {
    for (const tier of [0, 1]) {
      const r = recorder()
      paintTemple(temple(r.ctx, tier))
      expect(r.colours().has(COLUMN)).toBe(false)
      // A plank wall shows between the posts, away from the door.
      expect(r.colourAt(11, 20)).toBe(PLANK)
    }
  })

  it('from the classical age the temple stands on stone columns', () => {
    const r = recorder()
    paintTemple(temple(r.ctx, 2))
    expect(r.colours().has(COLUMN)).toBe(true)
    expect(r.colours().has(PLANK)).toBe(false)
  })

  it('a medieval temple carries the spire of a cathedral', () => {
    const low = recorder()
    paintTemple(temple(low.ctx, 2))
    expect(low.colours().has(SPIRE)).toBe(false)
    const high = recorder()
    paintTemple(temple(high.ctx, 3))
    expect(high.colours().has(SPIRE)).toBe(true)
  })
})
