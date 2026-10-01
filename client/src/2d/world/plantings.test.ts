import { describe, expect, it } from 'vitest'
import { decodePlantings, drawPlanting, PLANT_KIND } from './plantings'
import { SANDBOX_CATEGORIES } from '../../simulation/sandbox'

describe('plantings', () => {
  it('decodes the flat wire list and ignores a ragged tail', () => {
    expect(decodePlantings([3, 4, 0, 2, 9, 9, 2, 4, 1])).toEqual([
      { x: 3, y: 4, kind: PLANT_KIND.CROP, stage: 2 },
      { x: 9, y: 9, kind: PLANT_KIND.SAPLING, stage: 4 },
    ])
    expect(decodePlantings(undefined)).toEqual([])
  })

  it('paints every kind and stage inside its own tile', () => {
    const rects: [number, number, number, number][] = []
    const ctx = {
      fillStyle: '',
      fillRect: (x: number, y: number, w: number, h: number) => rects.push([x, y, w, h]),
    } as unknown as CanvasRenderingContext2D
    for (const kind of [0, 1, 2]) {
      for (let stage = 0; stage <= 4; stage++) drawPlanting(ctx, 16, 24, kind, stage)
    }
    expect(rects.length).toBeGreaterThan(0)
    for (const [x, y, w, h] of rects) {
      expect(x).toBeGreaterThanOrEqual(16)
      expect(y).toBeGreaterThanOrEqual(24 - 1)
      expect(x + w).toBeLessThanOrEqual(24)
      expect(y + h).toBeLessThanOrEqual(32)
    }
  })

  it('offers crops, orchards and saplings as plant commands', () => {
    const tools = SANDBOX_CATEGORIES.flatMap((c) => c.tools)
    for (const [id, kind] of [
      ['plant_crop', 'crop'],
      ['plant_orchard', 'orchard'],
      ['plant_sapling', 'sapling'],
    ] as const) {
      const tool = tools.find((t) => t.id === id)
      expect(tool?.build?.(10, 12, 1)).toMatchObject({ cmd: 'plant', x: 10, y: 12, kind })
    }
  })
})
