import { describe, expect, it } from 'vitest'
import { TILE } from '../../../model/palette'
import { artworkPixels, paintArtworks } from './paint-artworks'
import type { CfFrame } from './frame'

const KINDS = ['cave_painting', 'sculpture', 'fresco', 'painting', 'photograph', 'film', 'digital']

describe('artwork pixels', () => {
  it('draws a piece for every kind, inside the tile around its centre', () => {
    for (const kind of KINDS) {
      const pixels = artworkPixels(kind, 100, 100)
      expect(pixels.length, kind).toBeGreaterThan(3)
      for (const [x, y, w, h] of pixels) {
        expect(x).toBeGreaterThanOrEqual(100 - TILE)
        expect(y).toBeGreaterThanOrEqual(100 - TILE)
        expect(x + w).toBeLessThanOrEqual(100 + TILE)
        expect(y + h).toBeLessThanOrEqual(100 + TILE)
      }
    }
  })

  it('draws nothing for a kind it does not know', () => {
    expect(artworkPixels('mosaic', 0, 0)).toEqual([])
  })

  it('gives the cave painting red ochre, and the digital piece a glowing screen', () => {
    expect(artworkPixels('cave_painting', 0, 0).map((p) => p[4])).toContain('#b5472d')
    expect(artworkPixels('digital', 0, 0).map((p) => p[4])).toContain('#36d6ff')
  })
})

/** Records each rectangle filled, with the colour it was filled in. */
function recorder() {
  const rects: [number, number, number, number, string][] = []
  let colour = ''
  const ctx = {
    set fillStyle(value: string) {
      colour = value
    },
    fillRect(x: number, y: number, w: number, h: number) {
      rects.push([x, y, w, h, colour])
    },
  } as unknown as CanvasRenderingContext2D
  return { ctx, rects }
}

function frame(artworks: { kind: string; x?: number; y?: number }[]): CfFrame {
  return {
    world: { artworks },
    ox: 10,
    oy: 10,
    bounds: { c0: 0, c1: 50, r0: 0, r1: 50 },
  } as unknown as CfFrame
}

describe('paintArtworks', () => {
  it('draws each artwork at its tile on the map, and skips the ones out of view', () => {
    const { ctx, rects } = recorder()
    paintArtworks(
      ctx,
      frame([
        { kind: 'sculpture', x: 12, y: 13 },
        { kind: 'sculpture', x: 500, y: 500 },
        { kind: 'sculpture' },
      ]),
    )
    expect(rects.length).toBe(artworkPixels('sculpture', 0, 0).length)
    const cx = 2 * TILE + TILE / 2
    expect(rects.some(([x]) => x >= cx - 4 && x <= cx + 4)).toBe(true)
  })
})
