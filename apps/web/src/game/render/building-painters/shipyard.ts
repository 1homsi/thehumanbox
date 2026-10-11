import { OUTLINE, px, type P } from './kit'

/** The wood of a hull on the stocks, dark enough to stand out against the yard's packed earth. */
export const HULL_PLANK = '#9a6232'
export const HULL_KEEL = '#3a2616'
export const HULL_FRAME = '#4a3220'
const TRESTLE = '#6b4a2a'

/**
 * A shipyard: a plank slip running down to the water, the stocks a hull is built on beside it, and
 * a stack of logs. The hull on the stocks is the sim's (`passingState`): only the bare trestles
 * while the slip is empty, then a keel with its stem post ('hull1'), the ribs standing up from it
 * ('hull2'), and the planked hull ('hull3') that waits there for a berth.
 */
export function paintShipyard(p: P) {
  const { ctx, x0, y1, w, h } = p
  const top = y1 - h
  // Packed earth round the slip.
  px(ctx, x0 + 1, top + 1, w - 2, h - 2, '#a58a5c')
  // The slip: a plank ramp down the left-hand side.
  px(ctx, x0 + 2, top + 3, 3, h - 6, '#7a5a34')
  for (let y = top + 4; y < y1 - 3; y += 3) px(ctx, x0 + 2, y, 3, 1, '#5a4028')
  // The stocks take the yard's width beside the slip; the bow points away from it.
  const hx = x0 + 6
  const hw = Math.max(6, Math.round(w) - 8)
  const keelY = top + 10
  const stage = p.state === 'hull1' ? 1 : p.state === 'hull2' ? 2 : p.state === 'hull3' ? 3 : 0
  if (stage === 0) {
    // The stocks stand bare: a trestle at each end where the next keel is laid.
    px(ctx, hx + 1, keelY - 1, 2, 2, TRESTLE)
    px(ctx, hx + hw - 3, keelY - 1, 2, 2, TRESTLE)
  } else if (stage === 3) {
    // The planked hull: a dark gunwale, planking narrowing to the keel, the stem at the bow.
    px(ctx, hx, keelY - 4, hw, 1, HULL_FRAME)
    px(ctx, hx, keelY - 3, hw, 2, HULL_PLANK)
    px(ctx, hx + 1, keelY - 1, hw - 2, 1, HULL_PLANK)
    px(ctx, hx + 2, keelY, hw - 4, 1, HULL_KEEL)
    px(ctx, hx + hw - 1, keelY - 6, 1, 3, HULL_FRAME)
  } else {
    // The keel goes down first, with its stem post at the bow.
    px(ctx, hx + 2, keelY, hw - 4, 1, HULL_KEEL)
    px(ctx, hx + hw - 1, keelY - 6, 1, 6, HULL_FRAME)
    // Then the ribs stand up from it, shorter toward the ends where the hull narrows.
    if (stage === 2)
      for (let x = hx + 1; x < hx + hw - 1; x += 2) {
        const end = x === hx + 1 || x >= hx + hw - 3
        px(ctx, x, keelY - (end ? 3 : 4), 1, end ? 3 : 4, HULL_FRAME)
      }
  }
  // Logs stacked at the far corner.
  for (let i = 0; i < 3; i++) px(ctx, x0 + w - 7, y1 - 4 - i * 2, 5, 2, '#6b4a2a')
  ctx.strokeStyle = OUTLINE
  ctx.lineWidth = 1
  ctx.strokeRect(Math.round(x0) + 0.5, Math.round(top) + 0.5, Math.round(w) - 1, Math.round(h) - 1)
}
