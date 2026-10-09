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
    for (const kind of [0, 1, 2, 3]) {
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

/** The pixels a painter draws: each rectangle with the colour it was filled in. */
function pixelsOf(kind: number, stage: number, x = 16, y = 24): string[] {
  const out: string[] = []
  let fill = ''
  const ctx = {
    get fillStyle() {
      return fill
    },
    set fillStyle(v: string) {
      fill = v
    },
    fillRect(rx: number, ry: number, w: number, h: number) {
      out.push(`${rx - x},${ry - y},${w},${h},${fill}`)
    },
  } as unknown as CanvasRenderingContext2D
  drawPlanting(ctx, x, y, kind, stage)
  return out
}

describe('tree species', () => {
  const SAPLING = PLANT_KIND.SAPLING
  const SPECIES = [PLANT_KIND.OAK, PLANT_KIND.PINE, PLANT_KIND.PALM] as const

  it('each species looks different from the others and from the generic sapling once grown', () => {
    const grown = [...SPECIES, SAPLING].map((k) => pixelsOf(k, 3).join('|'))
    expect(new Set(grown).size).toBe(4)
  })

  it('each species changes as it grows, stage by stage', () => {
    for (const kind of SPECIES) {
      const stages = [0, 1, 2, 3].map((s) => pixelsOf(kind, s).join('|'))
      expect(new Set(stages).size).toBe(4)
    }
  })

  it('stays inside its own 8 px tile at every stage', () => {
    for (const kind of SPECIES) {
      for (let stage = 0; stage <= 4; stage++) {
        for (const rect of pixelsOf(kind, stage)) {
          const [rx, ry, w, h] = rect.split(',').map(Number) as [number, number, number, number]
          expect(rx).toBeGreaterThanOrEqual(0)
          expect(ry).toBeGreaterThanOrEqual(0)
          expect(rx + w).toBeLessThanOrEqual(8)
          expect(ry + h).toBeLessThanOrEqual(8)
        }
      }
    }
  })

  it('palms carry coconuts once grown, and pines carry dark needles', () => {
    expect(pixelsOf(PLANT_KIND.PALM, 3).some((r) => r.endsWith('#6b4a2a'))).toBe(true)
    expect(pixelsOf(PLANT_KIND.PALM, 1).some((r) => r.endsWith('#6b4a2a'))).toBe(false)
    expect(pixelsOf(PLANT_KIND.PINE, 3).some((r) => r.endsWith('#2f5e3b'))).toBe(true)
  })
})
