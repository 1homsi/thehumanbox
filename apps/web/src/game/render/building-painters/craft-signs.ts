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
}

const GLYPH_INK = '#f4e6c2'

export const CRAFT_SIGNS: Readonly<Record<string, CraftSign>> = {
  // A loaf of bread.
  Bakery: { board: '#c98a3a', glyph: ['.1.', '111', '11.'] },
  // A tankard.
  Tavern: { board: '#8c3b2a', glyph: ['11.', '111', '111'] },
  // A bed for travellers.
  Inn: { board: '#3d6b99', glyph: ['1.1', '111', '1.1'] },
  // Sails of a mill.
  Mill: { board: '#6d6a5a', glyph: ['1.1', '.1.', '1.1'] },
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
      if (row[c] === '1') px(p.ctx, gx + c, gy + r, 1, 1, GLYPH_INK)
    }
  })
  return true
}
