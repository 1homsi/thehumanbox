import { shade } from '../sprite-colors'
import { OUTLINE, px } from './kit'
import type { P } from './kit'
import { paintCottage } from './dwellings'

/**
 * A trade's shop sign: a painted board and a 3x3 glyph (1 = a glyph pixel).
 * Shops, inns and workshops that were only cottages before now show their trade
 * on the window they open onto, so a bakery, a tavern and a house read apart.
 */
interface CraftSign {
  board: string
  glyph: readonly string[]
  /** Glyph colour; cream unless the board is light. */
  ink?: string
}

const GLYPH_INK = '#f4e6c2'

export const CRAFT_SIGNS: Readonly<Record<string, CraftSign>> = {
  // A loaf of bread.
  Bakery: { board: '#c98a3a', glyph: ['.1.', '111', '11.'] },
  // A tankard on a gold board: the one trade sign light enough to read against a red roof.
  Tavern: { board: '#d9a441', glyph: ['11.', '111', '111'], ink: '#3a2412' },
  // A bed for travellers.
  Inn: { board: '#3d6b99', glyph: ['1.1', '111', '1.1'] },
  // A barrel.
  Brewery: { board: '#a8742a', glyph: ['.1.', '111', '111'] },
  // A boot.
  Cobbler: { board: '#5b3d24', glyph: ['11.', '11.', '111'] },
  // A leaf.
  Herbalist: { board: '#3f7a4a', glyph: ['.1.', '111', '.1.'] },
  // A drop of water.
  Bathhouse: { board: '#3e8ea3', glyph: ['.1.', '111', '.1.'] },
  Spa: { board: '#4f9bb0', glyph: ['1.1', '.1.', '1.1'] },
  // A paw.
  Kennel: { board: '#7a6654', glyph: ['1.1', '111', '.1.'] },
}

/** Whether a building kind gets a trade sign rather than a plain cottage front. */
export function hasCraftSign(kind: string): boolean {
  return kind in CRAFT_SIGNS
}

/** A cottage with its trade's sign on the window that opens onto the street. */
export function paintCraftHome(p: P): boolean {
  const sign = CRAFT_SIGNS[p.kind]
  if (!sign) return false
  paintCottage(p)
  const { x0, y1, w, h } = p
  const style = p.variant % 3
  const wallH = h * (style === 1 ? 0.48 : 0.55)
  const wallY = y1 - wallH
  const windowX = x0 + w * (style === 1 ? 0.2 : 0.66)
  // The shop window: a board the width of a window plus a little, hung below the eave.
  const bw = w >= 14 ? 5 : 4
  const bh = bw === 5 ? 5 : 4
  const bx = Math.round(Math.min(x0 + w - bw - 1, Math.max(x0 + 1, windowX - 1)))
  const by = Math.round(wallY + Math.max(2, wallH * 0.2))
  // Clear the old window glow first, then hang the board.
  px(p.ctx, bx - 1, by - 1, bw + 2, bh + 2, '#342f30')
  px(p.ctx, bx, by - 2, bw, 1, OUTLINE)
  px(p.ctx, bx, by, bw, bh, sign.board)
  px(p.ctx, bx, by + bh - 1, bw, 1, 'rgba(0,0,0,0.35)')
  // Center the 3x3 glyph on the board.
  const gx = bx + Math.floor((bw - 3) / 2)
  const gy = by + Math.floor((bh - 3) / 2)
  sign.glyph.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      if (row[c] === '1') px(p.ctx, gx + c, gy + r, 1, 1, sign.ink ?? GLYPH_INK)
    }
  })
  // The trade's own thing on the ground just left of the wall (in the sprite's side padding, away from the
  // cast shadow): an outline of its own, so shops read apart by shape and not only by a three-pixel glyph.
  const prop = TRADE_PROPS[p.kind]
  if (prop) prop(p, Math.round(x0) - 1, Math.round(y1), -1)
  return true
}

/**
 * A small pixel drawing at a shop's foot. `ax` is the column next to the wall, `dir` the way away from it;
 * `foot` is the ground row. Each grid is drawn from the wall outward.
 */
type TradeProp = (p: P, ax: number, foot: number, dir: number) => void

/** Draws a grid of colour keys with its bottom row on `foot`, reading from the wall outward. */
function grid(
  p: P,
  ax: number,
  foot: number,
  dir: number,
  rows: readonly string[],
  colors: Record<string, string>,
) {
  const h = rows.length
  rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const color = colors[row[c]]
      if (!color) continue
      px(p.ctx, dir > 0 ? ax + c : ax - c, foot - h + r, 1, 1, color)
    }
  })
}

const K = OUTLINE
const WOOD = '#8a5a32'
const WOOD_LIT = '#b07a46'
const HOOP = '#4a4038'

const TRADE_PROPS: Readonly<Record<string, TradeProp>> = {
  // A domed clay oven with a glowing mouth.
  Bakery: (p, ax, foot, dir) =>
    grid(p, ax, foot, dir, ['.kkk.', 'kcCck', 'kcook', 'kCCCk'], {
      k: K,
      c: '#c9805a',
      C: shade('#c9805a', 0.72),
      o: '#f0a040',
    }),
  // Two barrels by the door.
  Tavern: (p, ax, foot, dir) =>
    grid(p, ax, foot, dir, ['kkk.kkk', 'kwh.kwh', 'kWk.kWk', 'kwh.kwh', 'kkk.kkk'], {
      k: K,
      w: WOOD_LIT,
      W: WOOD,
      h: HOOP,
    }),
  // A lantern on a post, lit for travellers.
  Inn: (p, ax, foot, dir) =>
    grid(p, ax, foot, dir, ['.kkk', '.kyk', '.kkk', '..k.', '..k.', '..k.', '.kkk'], { k: K, y: '#f4d06a' }),
  // Barrels stacked three high.
  Brewery: (p, ax, foot, dir) =>
    grid(p, ax, foot, dir, ['..kkk..', '..kwk..', 'kkkkkkk', 'kwkkkwk', 'kWk.kWk', 'kkk.kkk'], {
      k: K,
      w: WOOD_LIT,
      W: WOOD,
    }),
  // A last and a stack of hides.
  Cobbler: (p, ax, foot, dir) =>
    grid(p, ax, foot, dir, ['kkkk', 'khhk', 'kHHk', 'kkkk'], { k: K, h: '#a2683e', H: '#7a4c2c' }),
  // Planters of herbs along the wall.
  Herbalist: (p, ax, foot, dir) =>
    grid(p, ax, foot, dir, ['.g.g.g', 'gGgGgG', 'kkkkkk', 'kWWWWk', 'kkkkkk'], {
      g: '#6aa84f',
      G: '#3f7a3a',
      k: K,
      W: WOOD,
    }),
  // A wooden tub of water.
  Bathhouse: (p, ax, foot, dir) =>
    grid(p, ax, foot, dir, ['kkkkk', 'kbbbk', 'kWWWk', 'kkkkk'], { k: K, b: '#5fa8c8', W: WOOD }),
  Spa: (p, ax, foot, dir) =>
    grid(p, ax, foot, dir, ['kkkkk', 'kbBbk', 'kWWWk', 'kkkkk'], {
      k: K,
      b: '#7cc0d8',
      B: '#f2f7fa',
      W: WOOD,
    }),
  // A doghouse.
  Kennel: (p, ax, foot, dir) =>
    grid(p, ax, foot, dir, ['..k..', '.kRk.', 'kRRRk', 'kwkwk', 'kwkwk', 'kkkkk'], {
      k: K,
      R: '#9a4a36',
      w: WOOD_LIT,
    }),
}
