import { describe, expect, it } from 'vitest'
import type { Building } from '../../../../shared/types'
import { TILE } from '../../../model/palette'
import { hasYard, yardRects } from './yard-marks'

const home = (id: number, kind = 'House', x = 10, y = 20): Building =>
  ({ id, kind, x, y }) as unknown as Building

describe('hasYard', () => {
  it('gives yards to homes only, and not to every home', () => {
    expect(hasYard(home(1, 'Market'))).toBe(false)
    expect(hasYard(home(1, 'Wall'))).toBe(false)
    const tents = Array.from({ length: 300 }, (_, i) => i).filter((id) => hasYard(home(id, 'tent')))
    expect(tents.length).toBeGreaterThan(100)
    const ids = Array.from({ length: 300 }, (_, i) => i)
    const yards = ids.filter((id) => hasYard(home(id, 'House')))
    expect(yards.length).toBeGreaterThan(150)
    expect(yards.length).toBeLessThan(250)
  })

  it('is fixed for a building', () => {
    expect(hasYard(home(7, 'Hut'))).toBe(hasYard(home(7, 'Hut')))
  })
})

describe('yardRects', () => {
  it('lays a yard east of the home and never on the home itself', () => {
    const id = Array.from({ length: 50 }, (_, i) => i).find((i) => hasYard(home(i)))!
    const rects = yardRects([home(id, 'House', 10, 20)], 0, 0)
    expect(rects).toHaveLength(11)
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(11 * TILE)
      expect(r.x + r.w).toBeLessThanOrEqual(12 * TILE)
      expect(r.y).toBeGreaterThanOrEqual(20 * TILE)
      // The plot and its fence reach a few pixels past the home's own row.
      expect(r.y + r.h).toBeLessThanOrEqual(21 * TILE + 4)
      expect(Number.isFinite(r.x) && Number.isFinite(r.y)).toBe(true)
    }
  })

  it('moves with the grid origin', () => {
    const id = Array.from({ length: 50 }, (_, i) => i).find((i) => hasYard(home(i)))!
    const a = yardRects([home(id, 'House', 10, 20)], 0, 0)
    const b = yardRects([home(id, 'House', 10, 20)], 4, 2)
    expect(b[0].x).toBe(a[0].x - 4 * TILE)
    expect(b[0].y).toBe(a[0].y - 2 * TILE)
  })

  it('skips buildings without a position', () => {
    const bad = { id: 1, kind: 'House' } as unknown as Building
    expect(yardRects([bad], 0, 0)).toHaveLength(0)
  })
})
