import { shade } from '../sprite-colors'
import { px, tintRoof } from './kit'
import type { P } from './kit'

/**
 * The granary and the market each have a shape no house has, so a village's stores and its trade read at
 * a glance at the standard zoom (#883). Both paint whole-pixel runs; the finish pass adds the outline.
 */

const STONE = { lit: '#bdb4a0', mid: '#9a917e', shade: '#6e6758' }
const THATCH = '#c49a3e'
const POST = '#5a4028'

/**
 * A granary: a round store of stone raised on short posts, so rats and floods stay out, under a tall cone of
 * golden thatch. One per footprint width, centred.
 */
export function paintGranary(p: P) {
  const { ctx, x0, y1, w } = p
  const cx = Math.round(x0 + w / 2)
  const half = Math.max(4, Math.round(w * 0.36))
  const ground = Math.round(y1)
  const legH = 2
  // The posts.
  for (const x of [cx - half + 1, cx - 1, cx + half - 2]) px(ctx, x, ground - legH, 1, legH, POST)
  // The drum: lit on the left, a course line every third row.
  const drumH = Math.max(5, Math.round(w * 0.36))
  const base = ground - legH
  for (let r = 0; r < drumH; r++) {
    const y = base - 1 - r
    const third = Math.round((half * 2) / 3)
    px(ctx, cx - half, y, third, 1, r % 3 === 2 ? STONE.mid : STONE.lit)
    px(ctx, cx - half + third, y, half * 2 - third * 2, 1, r % 3 === 2 ? STONE.shade : STONE.mid)
    px(ctx, cx + half - third, y, third, 1, STONE.shade)
  }
  // A small dark hatch high on the front.
  px(ctx, cx - 1, base - drumH + 1, 2, 2, '#2a1c10')
  // The cone of thatch, overhanging the drum by two pixels.
  const roof = tintRoof(p, THATCH)
  const lit = shade(roof, 1.14)
  const dark = shade(roof, 0.72)
  const eave = base - drumH
  const reach = half + 2
  const rh = Math.max(6, Math.round(reach * 1.3))
  for (let r = 0; r < rh; r++) {
    const span = Math.round(reach * (1 - r / rh))
    if (span <= 0) break
    const y = eave - r
    const course = r % 3 === 1
    px(ctx, cx - span, y, span, 1, course ? roof : lit)
    px(ctx, cx, y, span, 1, course ? shade(dark, 0.86) : dark)
  }
  px(ctx, cx - 1, eave - rh, 2, 2, POST)
}

/** Awning colours for market stalls, taken in turn: red, teal and ochre, each striped with cream. */
const AWNINGS = ['#a8432f', '#2f8079', '#c9973f']
const CREAM = '#efe4c8'

/**
 * A market: a paved square with a row of stalls under striped awnings, crates on the counters. It was the
 * town house with a shop front, which read as one more house.
 */
export function paintMarket(p: P) {
  const { ctx, x0, y1, w } = p
  const left = Math.round(x0)
  const width = Math.round(w)
  const ground = Math.round(y1)
  // The paving: light flags with a joint every fourth pixel.
  px(ctx, left, ground - 4, width, 4, '#b8ac94')
  for (let x = left + 3; x < left + width; x += 4) px(ctx, x, ground - 4, 1, 4, '#9e927c')
  px(ctx, left, ground - 4, width, 1, '#cfc4aa')
  // The stalls, two rows deep: the back row higher on the paving, the front row lower.
  const stallW = Math.max(6, Math.floor(width / 3))
  const count = Math.max(1, Math.floor(width / stallW))
  const rows = width >= 16 ? [ground - 9, ground - 2] : [ground - 2]
  let k = Math.floor(p.variant % AWNINGS.length)
  for (const base of rows) {
    for (let i = 0; i < count; i++) {
      const sx = left + i * stallW + (base === rows[0] && rows.length > 1 ? Math.floor(stallW / 2) - 1 : 0)
      if (sx + stallW - 1 > left + width) continue
      const colour = AWNINGS[k++ % AWNINGS.length]
      const aw = stallW - 1
      // Posts, the counter with goods on it, then the awning over them, striped and scalloped.
      px(ctx, sx, base - 6, 1, 6, POST)
      px(ctx, sx + aw - 1, base - 6, 1, 6, POST)
      px(ctx, sx + 1, base - 3, aw - 2, 2, '#8e6642')
      px(ctx, sx + 1, base - 4, Math.max(1, Math.floor(aw / 2) - 1), 1, '#c8a46e')
      px(ctx, sx + Math.floor(aw / 2), base - 4, Math.max(1, Math.floor(aw / 2) - 1), 1, '#7d8f4a')
      for (let x = 0; x < aw + 1; x++) {
        const c = x % 2 === 0 ? colour : CREAM
        px(ctx, sx - 1 + x, base - 8, 1, 2, c)
        if (x % 2 === 0) px(ctx, sx - 1 + x, base - 6, 1, 1, colour)
      }
    }
  }
}
