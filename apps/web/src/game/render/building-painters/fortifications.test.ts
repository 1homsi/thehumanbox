import { describe, expect, it, vi } from 'vitest'
import { hasBuildingSprite } from './registry'
import type { P } from './kit'
import { mulberry32 } from './kit'
import { paintGate, paintTower } from './fortifications'

/** A canvas context stand-in that records the colour of every pixel it fills. */
function recorder() {
  const pixels = new Map<string, string>()
  const ctx = {
    fillStyle: '',
    fillRect: vi.fn((x: number, y: number, w: number, h: number) => {
      for (let i = 0; i < w; i++)
        for (let j = 0; j < h; j++) pixels.set(`${x + i},${y + j}`, String(ctx.fillStyle))
    }),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
  }
  return {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    colourAt: (x: number, y: number) => pixels.get(`${x},${y}`),
  }
}

/** A one-tile gate: 8 px wide, 20 px tall with its base at y 28 (the sprite's own numbers). */
function gate(ctx: CanvasRenderingContext2D): P {
  return {
    ctx,
    x0: 8,
    y1: 28,
    w: 8,
    h: 20,
    rng: mulberry32(7),
    night: 0,
    cond: 1,
    kind: 'Gate',
    variant: 0,
    tier: 2,
    state: '',
  }
}

/** A two-tile tower: 16 px wide, 28 px tall. */
function tower(ctx: CanvasRenderingContext2D): P {
  return { ...gate(ctx), w: 16, h: 28, kind: 'Tower' }
}

describe('gate and tower painters', () => {
  it('a gate closes a dark round-headed opening with doors, between taller piers', () => {
    const r = recorder()
    paintGate(gate(r.ctx))
    // The dark head of the opening sits above the doors, in the middle of the gate.
    expect(r.colourAt(11, 18)).toBe('#2a1c10')
    // The doors fill the opening below it.
    expect(r.colourAt(11, 24)).toBe('#7a5232')
    // Stone piers stand on both sides of the opening, up to the lintel.
    expect(r.colourAt(8, 22)).toBeDefined()
    expect(r.colourAt(14, 22)).toBeDefined()
  })

  it('a tower stands above the sprite base with a battlement, an arrow slit and a door', () => {
    const r = recorder()
    paintTower(tower(r.ctx))
    // Battlement row at the very top of the shaft.
    const top = Math.round(28 - 28 * 0.98)
    expect(r.colourAt(12, top)).toBeDefined()
    // Arrow slit (dark) above the middle of the shaft.
    expect(r.colourAt(16, top + 5)).toBe('#2a1c10')
    // The door (dark) at the foot.
    expect(r.colourAt(16, 26)).toBe('#2a1c10')
  })

  it('both kinds are registered to their own painters', () => {
    expect(hasBuildingSprite('Gate')).toBe(true)
    expect(hasBuildingSprite('Tower')).toBe(true)
  })
})
