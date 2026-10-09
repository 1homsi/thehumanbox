import { describe, expect, it, vi } from 'vitest'
import type { P } from './kit'
import { CRAFT_SIGNS, hasCraftSign, paintCraftHome } from './craft-signs'

interface Rect {
  x: number
  y: number
  w: number
  h: number
  color: string
}

/** A canvas context stand-in that records every filled rectangle. */
function recorder() {
  const rects: Rect[] = []
  const noop = () => {}
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    fillRect: vi.fn((x: number, y: number, w: number, h: number) => {
      rects.push({ x, y, w, h, color: String(ctx.fillStyle) })
    }),
    strokeRect: vi.fn(noop),
    beginPath: vi.fn(noop),
    moveTo: vi.fn(noop),
    lineTo: vi.fn(noop),
    closePath: vi.fn(noop),
    fill: vi.fn(noop),
    stroke: vi.fn(noop),
    save: vi.fn(noop),
    restore: vi.fn(noop),
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, rects }
}

const shop = (kind: string, ctx: CanvasRenderingContext2D, variant = 0): P => ({
  ctx,
  x0: 8,
  y1: 40,
  w: 16,
  h: 20,
  rng: () => 0.5,
  night: 0,
  cond: 1,
  kind,
  variant,
  tier: 1,
  state: '',
})

describe('trade signs', () => {
  it('gives every trade kind its own board colour', () => {
    const boards = Object.values(CRAFT_SIGNS).map((sign) => sign.board)
    expect(new Set(boards).size).toBe(boards.length)
  })

  it('knows the trade kinds and not a plain house', () => {
    for (const kind of [
      'Bakery',
      'Tavern',
      'Inn',
      'Mill',
      'Brewery',
      'Cobbler',
      'Herbalist',
      'Spa',
      'Kennel',
    ]) {
      expect(hasCraftSign(kind)).toBe(true)
    }
    expect(hasCraftSign('House')).toBe(false)
    expect(hasCraftSign('Hut')).toBe(false)
  })

  it('paints the trade board on the shop window of a bakery', () => {
    const { ctx, rects } = recorder()
    expect(paintCraftHome(shop('Bakery', ctx))).toBe(true)
    expect(rects.some((r) => r.color === CRAFT_SIGNS.Bakery.board && r.w >= 4)).toBe(true)
  })

  it('paints a different board for a tavern than for a bakery', () => {
    const bakery = recorder()
    const tavern = recorder()
    paintCraftHome(shop('Bakery', bakery.ctx))
    paintCraftHome(shop('Tavern', tavern.ctx))
    const bakeryBoards = bakery.rects.filter((r) => r.color === CRAFT_SIGNS.Bakery.board)
    const tavernBoards = tavern.rects.filter((r) => r.color === CRAFT_SIGNS.Tavern.board)
    expect(bakeryBoards.length).toBeGreaterThan(0)
    expect(tavernBoards.length).toBeGreaterThan(0)
    expect(tavern.rects.some((r) => r.color === CRAFT_SIGNS.Bakery.board)).toBe(false)
  })

  it('lays the glyph in the same ink on top of the board', () => {
    const { ctx, rects } = recorder()
    paintCraftHome(shop('Inn', ctx))
    const ink = rects.filter((r) => r.color === '#f4e6c2' && r.w === 1 && r.h === 1)
    const lit = CRAFT_SIGNS.Inn.glyph.join('').split('1').length - 1
    expect(ink.length).toBe(lit)
  })

  it('declines a kind without a sign so the caller keeps the plain cottage', () => {
    const { ctx } = recorder()
    expect(paintCraftHome(shop('House', ctx))).toBe(false)
  })
})
