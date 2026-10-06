// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { paintDecorTile } from '../../decorations'
import { BIOME_ID, TILE_ID } from '../../../model/terrain-ids'
import { createProbe } from './draw-probe'

describe('draw probe', () => {
  it('records whether anything was drawn and how far the marks reach', () => {
    const p = createProbe()
    expect(p.drew).toBe(false)
    p.ctx.fillRect(2, 3, 4, 5)
    expect(p.drew).toBe(true)
    expect([p.x0, p.y0, p.x1, p.y1]).toEqual([2, 3, 6, 8])
    p.reset()
    expect(p.drew).toBe(false)
    p.ctx.beginPath()
    p.ctx.moveTo(1, 1)
    p.ctx.lineTo(4, 6)
    p.ctx.stroke()
    expect([p.x0, p.y0, p.x1, p.y1]).toEqual([0, 0, 5, 7])
  })

  it('finds the decorated tiles of a world and every mark stays inside the decor cell', () => {
    const p = createProbe()
    let decorated = 0
    for (const biome of Object.values(BIOME_ID)) {
      for (const tile of [TILE_ID.GRASS, TILE_ID.ROCK, TILE_ID.SAND, TILE_ID.SNOW, TILE_ID.WATER]) {
        for (let i = 0; i < 400; i++) {
          p.reset()
          paintDecorTile(p.ctx, tile, biome, i * 7, i * 13, 0, 0)
          if (!p.drew) continue
          decorated++
          // The decor cell reaches x -1..11 and y -3..9 around the tile (see decor-driver).
          expect(p.x0).toBeGreaterThanOrEqual(-1)
          expect(p.x1).toBeLessThanOrEqual(11)
          expect(p.y0).toBeGreaterThanOrEqual(-3)
          expect(p.y1).toBeLessThanOrEqual(9)
        }
      }
    }
    expect(decorated).toBeGreaterThan(50)
  })

  it('gives tiles that made the same calls the same signature, and only those', () => {
    // An oracle: every call and assignment as text.
    const trace = (tile: number, biome: number, x: number, y: number): string => {
      const log: string[] = []
      const state: Record<string, unknown> = {}
      const ctx = new Proxy(state, {
        get: (t, key: string) =>
          key in t ? t[key] : (...args: unknown[]) => void log.push(`${key}(${args.join(',')})`),
        set: (t, key: string, value) => (log.push(`${key}=${String(value)}`), (t[key] = value), true),
      }) as unknown as CanvasRenderingContext2D
      paintDecorTile(ctx, tile, biome, x, y, 0, 0)
      return log.join(';')
    }
    const p = createProbe()
    const bySignature = new Map<string, string>()
    let shared = 0
    let decorated = 0
    for (const biome of Object.values(BIOME_ID)) {
      for (const tile of [TILE_ID.GRASS, TILE_ID.ROCK, TILE_ID.SAND, TILE_ID.SNOW]) {
        for (let i = 0; i < 600; i++) {
          p.reset()
          paintDecorTile(p.ctx, tile, biome, i * 7, i * 13, 0, 0)
          if (!p.drew) continue
          decorated++
          const calls = trace(tile, biome, i * 7, i * 13)
          const seen = bySignature.get(p.signature())
          if (seen === undefined) bySignature.set(p.signature(), calls)
          else {
            shared++
            // The same signature must mean the same drawing.
            expect(calls).toBe(seen)
          }
        }
      }
    }
    expect(decorated).toBeGreaterThan(200)
    // And the signature actually merges tiles: that is the point of it.
    expect(shared).toBeGreaterThan(decorated / 10)
    // Different drawings keep different signatures.
    expect(new Set(bySignature.values()).size).toBe(bySignature.size)
  })

  it('tells apart a different colour, line width and shape', () => {
    const sig = (draw: (c: CanvasRenderingContext2D) => void) => {
      const p = createProbe()
      draw(p.ctx)
      return p.signature()
    }
    const base = sig((c) => {
      c.fillStyle = '#fff'
      c.fillRect(1, 2, 3, 4)
    })
    expect(sig((c) => ((c.fillStyle = '#fff'), c.fillRect(1, 2, 3, 4)))).toBe(base)
    expect(sig((c) => ((c.fillStyle = '#fef'), c.fillRect(1, 2, 3, 4)))).not.toBe(base)
    expect(sig((c) => ((c.fillStyle = '#fff'), c.fillRect(1, 2, 3, 5)))).not.toBe(base)
    expect(sig((c) => ((c.strokeStyle = '#fff'), c.fillRect(1, 2, 3, 4)))).not.toBe(base)
    expect(
      sig((c) => {
        c.fillStyle = '#fff'
        c.fillRect(1, 2, 3, 4)
        c.lineWidth = 2
      }),
    ).not.toBe(base)
    // Order matters: two marks swapped paint differently where they overlap.
    const ab = sig((c) => (c.fillRect(0, 0, 1, 1), c.fillRect(2, 2, 1, 1)))
    const ba = sig((c) => (c.fillRect(2, 2, 1, 1), c.fillRect(0, 0, 1, 1)))
    expect(ab).not.toBe(ba)
  })

  it('never decorates water', () => {
    const p = createProbe()
    for (let i = 0; i < 500; i++) {
      p.reset()
      paintDecorTile(p.ctx, TILE_ID.WATER, BIOME_ID.GRASSLAND, i, i * 3, 0, 0)
      expect(p.drew).toBe(false)
    }
  })
})
