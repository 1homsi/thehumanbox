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

  it('never decorates water', () => {
    const p = createProbe()
    for (let i = 0; i < 500; i++) {
      p.reset()
      paintDecorTile(p.ctx, TILE_ID.WATER, BIOME_ID.GRASSLAND, i, i * 3, 0, 0)
      expect(p.drew).toBe(false)
    }
  })
})
