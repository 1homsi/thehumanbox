import { describe, expect, it, vi } from 'vitest'
import { paintManor, paintVillageHome } from './dwellings'
import { mulberry32 } from './kit'
import type { P } from './kit'

/** The cells a painter fills with fillRect, as "x,y" keys: enough to tell one plan from another. */
function footprint(paint: (p: P) => unknown, kind: string, variant: number, w = 20, h = 24): Set<string> {
  const cells = new Set<string>()
  const noop = vi.fn()
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    fillRect: (x: number, y: number, rw: number, rh: number) => {
      for (let i = 0; i < Math.round(rw); i++)
        for (let j = 0; j < Math.round(rh); j++) cells.add(`${Math.round(x) + i},${Math.round(y) + j}`)
    },
  }
  // Paths and strokes leave no cells; any other drawing call is a no-op.
  const canvas = new Proxy(ctx, { get: (t, k) => (k in t ? t[k as keyof typeof t] : noop) })
  paint({
    ctx: canvas as unknown as CanvasRenderingContext2D,
    x0: 4,
    y1: h + 8,
    w,
    h,
    rng: mulberry32(7),
    night: 0,
    cond: 1,
    kind,
    variant,
    tier: 1,
    state: '',
    land: '',
  })
  return cells
}

const same = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((c) => b.has(c))

describe('village homes', () => {
  it('come in three plans, not one plan in three colours', () => {
    // Variants 0, 3 and 6 share a colour style (variant % 3) but not a plan.
    const [gabled, long, leanTo] = [0, 3, 6].map((v) => footprint(paintVillageHome, 'House', v))
    expect(same(gabled, long)).toBe(false)
    expect(same(gabled, leanTo)).toBe(false)
    expect(same(long, leanTo)).toBe(false)
  })

  it('paint the same home the same way every time', () => {
    for (const v of [0, 3, 6]) {
      expect(same(footprint(paintVillageHome, 'House', v), footprint(paintVillageHome, 'House', v))).toBe(
        true,
      )
    }
  })
})

describe('manors', () => {
  it('are built to four different plans', () => {
    const plans = [0, 1, 2, 3].map((v) => footprint(paintManor, 'Manor', v, 32, 30))
    for (let a = 0; a < plans.length; a++)
      for (let b = a + 1; b < plans.length; b++) expect(same(plans[a], plans[b])).toBe(false)
  })
})
