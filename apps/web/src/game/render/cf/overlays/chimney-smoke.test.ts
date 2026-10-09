import { describe, expect, it } from 'vitest'
import type { Building } from '../../../../shared/types'
import { PUFFS_PER_CHIMNEY, paintChimneySmoke, puffOf, sendsSmoke } from './chimney-smoke'

const HOME = { id: 7, kind: 'hut', function: 'housing', x: 10, y: 12, fw: 2, fh: 2 } as unknown as Building

function countingContext() {
  const fills = { n: 0 }
  const ctx = {
    save() {},
    restore() {},
    fillRect() {
      fills.n++
    },
    set fillStyle(_: string) {},
    set globalAlpha(_: number) {},
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, fills }
}

const BOUNDS = { c0: 0, c1: 60, r0: 0, r1: 60 }

describe('puffOf', () => {
  it('climbs, widens and fades as its cycle runs (the young puff is faint and low, the old one high and fading)', () => {
    // Sample one puff over one cycle: the most opaque sample is the youngest, the least the oldest.
    let young = puffOf(HOME, 0, 0, 0, 0)
    let old = puffOf(HOME, 0, 0, 0, 0)
    for (let t = 0; t < 2400; t += 10) {
      const p = puffOf(HOME, 0, t, 0, 0)
      if (p.a > young.a) young = p
      if (p.a < old.a) old = p
    }
    expect(young.y).toBeGreaterThan(old.y) // the old puff has climbed higher (smaller y)
    expect(old.r).toBeGreaterThan(young.r) // and spread wider
  })

  it('keeps the puffs at the home’s chimney, above its roof', () => {
    for (let k = 0; k < PUFFS_PER_CHIMNEY; k++) {
      for (let t = 0; t < 5000; t += 137) {
        const p = puffOf(HOME, k, t, 0, 0)
        expect(p.x).toBeGreaterThan(HOME.x * 8)
        expect(p.x).toBeLessThan((HOME.x + 3) * 8)
        expect(p.y).toBeLessThan(HOME.y * 8)
        expect(p.y).toBeGreaterThan(HOME.y * 8 - 20)
        expect(Number.isFinite(p.r + p.a)).toBe(true)
      }
    }
  })
})

describe('sendsSmoke', () => {
  it('sends smoke from finished homes only', () => {
    expect(sendsSmoke(HOME)).toBe(true)
    expect(sendsSmoke({ ...HOME, function: 'civic' } as unknown as Building)).toBe(false)
    expect(sendsSmoke({ ...HOME, kind: 'tent' } as unknown as Building)).toBe(false)
    expect(sendsSmoke({ ...HOME, construction_progress: 0.4 } as unknown as Building)).toBe(false)
  })
})

describe('paintChimneySmoke', () => {
  it('draws nothing without buildings', () => {
    const { ctx, fills } = countingContext()
    paintChimneySmoke(ctx, BOUNDS, 0, 0, undefined, 500)
    expect(fills.n).toBe(0)
  })

  it('draws the puffs of a home in view, and skips a home out of view', () => {
    const { ctx, fills } = countingContext()
    paintChimneySmoke(ctx, BOUNDS, 0, 0, [HOME], 500)
    expect(fills.n).toBe(PUFFS_PER_CHIMNEY)
    const away = countingContext()
    paintChimneySmoke(away.ctx, { c0: 100, c1: 160, r0: 0, r1: 60 }, 0, 0, [HOME], 500)
    expect(away.fills.n).toBe(0)
  })

  it('draws no smoke over the whole-world view', () => {
    const { ctx, fills } = countingContext()
    paintChimneySmoke(ctx, { c0: 0, c1: 300, r0: 0, r1: 300 }, 0, 0, [HOME], 500)
    expect(fills.n).toBe(0)
  })
})
