import { px, type P } from './kit'

/** The wood of a hull on the stocks, dark enough to stand out against the yard's packed earth. */
export const HULL_PLANK = '#9a6232'
export const HULL_KEEL = '#3a2616'
export const HULL_FRAME = '#4a3220'
const TRESTLE = '#6b4a2a'
const BEAM = '#7d5530'
const BEAM_LIGHT = '#a87945'
const ROPE = '#c9b27a'
const SLIP_PLANK = '#a07a4a'
const SLIP_SHADE = '#5a4028'
const YARD_EARTH = '#8f7550'
const YARD_EARTH_LIGHT = '#a58a5c'
const YARD_EARTH_DARK = '#6a5438'
const LOG = '#6b4a2a'
const LOG_END = '#c49a62'

/**
 * A shipyard: a plank slip running down to the water, the stocks a hull is built on beside it, and
 * a stack of logs. The hull on the stocks is the sim's (`passingState`): only the bare trestles
 * while the slip is empty, then a keel with its stem post ('hull1'), the ribs standing up from it
 * ('hull2'), and the planked hull ('hull3') that waits there for a berth.
 */
export function paintShipyard(p: P) {
  const { ctx, x0, y1, w, h } = p
  const width = Math.round(w)
  const right = x0 + width
  const ground = y1 - 3
  px(ctx, x0 + 1, ground, width - 2, 3, YARD_EARTH)
  px(ctx, x0 + 1, ground, width - 2, 1, YARD_EARTH_LIGHT)
  px(ctx, x0 + 1, y1 - 1, width - 2, 1, YARD_EARTH_DARK)
  for (let i = 0; i < 4; i++) {
    px(ctx, x0 + 2, ground - 1 - i * 2, 3, 1, SLIP_PLANK)
    px(ctx, x0 + 2, ground - i * 2, 3, 1, SLIP_SHADE)
  }
  px(ctx, x0 + 2, ground - 8, 1, 8, SLIP_SHADE)
  const hx = x0 + 6
  const hw = Math.max(6, width - 8)
  const keelY = ground - 3
  const gantryTop = Math.max(y1 - h + 2, keelY - 14)
  px(ctx, hx - 1, gantryTop, 1, ground - gantryTop, TRESTLE)
  px(ctx, hx + hw, gantryTop, 1, ground - gantryTop, TRESTLE)
  px(ctx, hx - 2, gantryTop, hw + 4, 2, BEAM)
  px(ctx, hx - 2, gantryTop, hw + 4, 1, BEAM_LIGHT)
  const ropeX = hx + Math.floor(hw / 2)
  px(ctx, ropeX, gantryTop + 2, 1, 4, ROPE)
  px(ctx, ropeX - 1, gantryTop + 6, 3, 1, ROPE)
  for (const tx of [hx + 1, hx + hw - 3]) {
    px(ctx, tx, keelY + 1, 2, ground - keelY - 1, TRESTLE)
    px(ctx, tx - 1, ground - 1, 4, 1, TRESTLE)
  }
  const stage = p.state === 'hull1' ? 1 : p.state === 'hull2' ? 2 : p.state === 'hull3' ? 3 : 0
  if (stage === 3) {
    px(ctx, hx, keelY - 4, hw, 1, HULL_FRAME)
    px(ctx, hx, keelY - 3, hw, 2, HULL_PLANK)
    px(ctx, hx + 1, keelY - 1, hw - 2, 1, HULL_PLANK)
    px(ctx, hx + 2, keelY, hw - 4, 1, HULL_KEEL)
    px(ctx, hx + hw - 1, keelY - 6, 1, 3, HULL_FRAME)
  } else if (stage > 0) {
    px(ctx, hx + 2, keelY, hw - 4, 1, HULL_KEEL)
    px(ctx, hx + hw - 1, keelY - 6, 1, 6, HULL_FRAME)
    if (stage === 2)
      for (let x = hx + 1; x < hx + hw - 1; x += 2) {
        const end = x === hx + 1 || x >= hx + hw - 3
        px(ctx, x, keelY - (end ? 3 : 4), 1, end ? 3 : 4, HULL_FRAME)
      }
  } else {
    px(ctx, hx + 1, keelY - 1, hw - 2, 1, BEAM)
  }
  for (let i = 0; i < 3; i++) {
    const ly = ground - 2 - i * 2
    const lx = right - 6 + (i % 2)
    px(ctx, lx, ly, 4, 2, LOG)
    px(ctx, lx + 3, ly, 1, 2, LOG_END)
  }
}
