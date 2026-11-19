import { describe, expect, it } from 'vitest'
import type { WorldState } from '../../../../shared/types'
import { nationColour } from '../../../model/nations'
import { TILE } from '../../../model/palette'
import { paintNationBorders } from './paint-nations'

function recorder() {
  const rects: { style: string; x: number; y: number; w: number; h: number }[] = []
  const ctx = {
    fillStyle: '',
    fillRect(x: number, y: number, w: number, h: number) {
      rects.push({ style: String(ctx.fillStyle), x, y, w, h })
    },
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, rects }
}

const world = {
  grid: { origin_x: 0, origin_y: 0 },
  nations: [
    {
      id: 4,
      name: 'Ovarra',
      colour: 2,
      capital: 1,
      capital_at: [1, 1],
      ruler: 'a',
      members: ['a', 'b'],
      towns: [1],
      founded_tick: 0,
      cohesion: 1,
      relations: [],
    },
  ],
  territory: {
    claimed: [
      { lid: 'a', tiles: [[1, 1]] },
      { lid: 'b', tiles: [[2, 1]] },
      { lid: 'c', tiles: [[5, 5]] },
    ],
    contested: [],
  },
} as unknown as WorldState

describe('nation borders', () => {
  it('tints a nation in its colour and draws one border round all its member tribes', () => {
    const { ctx, rects } = recorder()
    paintNationBorders(ctx, world)
    const tint = rects.filter((r) => r.style === nationColour(2, 0.12))
    expect(tint.map((r) => [r.x / TILE, r.y / TILE])).toEqual([
      [1, 1],
      [2, 1],
    ])
    const edges = rects.filter((r) => r.style === nationColour(2, 0.85))
    expect(edges).toHaveLength(6)
    expect(edges.some((r) => r.x === 2 * TILE - 2 && r.w === 2)).toBe(false)
    expect(rects.some((r) => r.x === 5 * TILE)).toBe(false)
  })

  it('draws nothing in a world without nations', () => {
    const { ctx, rects } = recorder()
    paintNationBorders(ctx, { ...world, nations: [] })
    expect(rects).toHaveLength(0)
  })
})
