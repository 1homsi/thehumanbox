import { OUTLINE, px, type P } from './kit'

/** The wood of a hull on the stocks: planking, its shadowed keel, and the frames. */
const PLANK = '#c59a5e'
const KEEL = '#8a6440'
const FRAME = '#5a4028'

/**
 * A shipyard: a plank slip running down to the water, the stocks a hull is built on, and a stack
 * of logs beside it. The hull on the stocks is the sim's (`passingState`): nothing but the bare
 * trestles while the slip is empty, then a keel ('hull1'), its ribs ('hull2') and the planked hull
 * ('hull3') that waits there for a berth.
 */
export function paintShipyard(p: P) {
  const { ctx, x0, y1, w, h } = p
  const top = y1 - h
  // Packed earth round the slip.
  px(ctx, x0 + 1, top + 1, w - 2, h - 2, '#a58a5c')
  // The slip: a plank ramp down the left-hand side.
  px(ctx, x0 + 2, top + 3, 3, h - 6, '#7a5a34')
  for (let y = top + 4; y < y1 - 3; y += 3) px(ctx, x0 + 2, y, 3, 1, '#5a4028')
  const hx = x0 + Math.round(w * 0.4)
  const hw = Math.max(6, Math.round(w * 0.45))
  const stage = p.state === 'hull1' ? 1 : p.state === 'hull2' ? 2 : p.state === 'hull3' ? 3 : 0
  if (stage === 0) {
    // The stocks stand bare: a trestle at each end where the keel is laid.
    px(ctx, hx + 1, top + 8, 2, 3, FRAME)
    px(ctx, hx + hw - 3, top + 8, 2, 3, FRAME)
  } else {
    // The keel goes down first, with its stem post at the bow.
    px(ctx, hx + 1, top + 9, hw - 2, 1, KEEL)
    px(ctx, hx + hw - 2, top + 6, 1, 3, FRAME)
    // Then the planking, over the lower frames.
    if (stage === 3) px(ctx, hx, top + 6, hw, 3, PLANK)
    // The ribs stand up from the keel (and show above the planking once it is on).
    if (stage >= 2) for (let x = hx + 2; x < hx + hw - 1; x += 3) px(ctx, x, top + 4, 1, 5, FRAME)
  }
  // Logs stacked at the far corner.
  for (let i = 0; i < 3; i++) px(ctx, x0 + w - 7, y1 - 4 - i * 2, 5, 2, '#6b4a2a')
  ctx.strokeStyle = OUTLINE
  ctx.lineWidth = 1
  ctx.strokeRect(Math.round(x0) + 0.5, Math.round(top) + 0.5, Math.round(w) - 1, Math.round(h) - 1)
}
