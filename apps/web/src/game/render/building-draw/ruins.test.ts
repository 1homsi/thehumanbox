import { describe, expect, it } from 'vitest'
import { drawRuinedBuilding, FOUNDATIONS_AGE } from './ruins'
import type { BuildingState } from '../../model/building-state'
import type { BuildingLike } from './types'

function rects(ruinAge: number): string[] {
  const out: string[] = []
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_t, key: string) =>
      key === 'fillRect'
        ? (...args: number[]) => {
            out.push(args.join(','))
          }
        : () => undefined,
    set: () => true,
  }) as unknown as CanvasRenderingContext2D
  const building = { id: 4, kind: 'house', x: 0, y: 0, ruinAge, tier: 2 } as unknown as BuildingLike
  drawRuinedBuilding(ctx, building, { isRepairing: false } as BuildingState, 0, 0, 16, 16, 8, 'detail')
  return out
}

describe('ruins as they age', () => {
  it('lose their walls and keep only the line of their foundations', () => {
    const footing = '0,8,16,1'
    expect(rects(0.1)).not.toContain(footing)
    expect(rects(FOUNDATIONS_AGE + 0.2)).toContain(footing)
    expect(rects(FOUNDATIONS_AGE + 0.2).length).toBeLessThan(rects(0.1).length)
  })
})
