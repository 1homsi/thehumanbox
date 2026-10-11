import { OUTLINE, px, type P } from './kit'

/**
 * A shipyard: a plank slip running down to the water, a hull on the stocks with its ribs
 * showing, and a stack of logs beside it. Boats are built here, so the hull is what to see.
 */
export function paintShipyard(p: P) {
  const { ctx, x0, y1, w, h } = p
  const top = y1 - h
  // Packed earth round the slip.
  px(ctx, x0 + 1, top + 1, w - 2, h - 2, '#a58a5c')
  // The slip: a plank ramp down the left-hand side.
  px(ctx, x0 + 2, top + 3, 3, h - 6, '#7a5a34')
  for (let y = top + 4; y < y1 - 3; y += 3) px(ctx, x0 + 2, y, 3, 1, '#5a4028')
  // A hull on the stocks: planking, a dark keel and the ribs.
  const hx = x0 + Math.round(w * 0.4)
  const hw = Math.max(6, Math.round(w * 0.45))
  px(ctx, hx, top + 6, hw, 3, '#c59a5e')
  px(ctx, hx + 1, top + 9, hw - 2, 1, '#8a6440')
  for (let x = hx + 2; x < hx + hw - 1; x += 3) px(ctx, x, top + 4, 1, 5, '#5a4028')
  // Logs stacked at the far corner.
  for (let i = 0; i < 3; i++) px(ctx, x0 + w - 7, y1 - 4 - i * 2, 5, 2, '#6b4a2a')
  ctx.strokeStyle = OUTLINE
  ctx.lineWidth = 1
  ctx.strokeRect(Math.round(x0) + 0.5, Math.round(top) + 0.5, Math.round(w) - 1, Math.round(h) - 1)
}
