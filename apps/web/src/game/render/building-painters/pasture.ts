import { OUTLINE, px, type P } from './kit'

/**
 * A pen: a fenced paddock beside the houses where a tribe keeps its livestock. The
 * animals themselves are drawn by the animal layer on top, so the pen is only the
 * ground, a post-and-rail fence round it, and a trough.
 */
export function paintPen(p: P) {
  const { ctx, x0, y1, w, h, rng } = p
  const top = y1 - h
  // The ground inside the rails, a little darker at the edges.
  px(ctx, x0 + 2, top + 2, w - 4, h - 4, '#8fae5a')
  for (let i = 0; i < 6; i++) {
    const gx = x0 + 3 + Math.floor(rng() * (w - 7))
    const gy = top + 3 + Math.floor(rng() * (h - 7))
    px(ctx, gx, gy, 1, 1, '#6f9046')
  }
  // Post-and-rail fence round the paddock.
  const rail = '#8a6440'
  px(ctx, x0, top, w, 1, rail)
  px(ctx, x0, y1 - 1, w, 1, rail)
  px(ctx, x0, top, 1, h, rail)
  px(ctx, x0 + w - 1, top, 1, h, rail)
  px(ctx, x0 + w * 0.5, top + 3, w * 0.5 - 1, 1, rail)
  for (let x = x0; x <= x0 + w - 1; x += 4) px(ctx, Math.round(x), top - 1, 1, 3, '#5a4028')
  for (let y = top; y <= y1 - 1; y += 4) px(ctx, x0 - 1, Math.round(y), 2, 1, '#5a4028')
  // A water trough in the near corner.
  const tx = x0 + w - 9
  px(ctx, tx, y1 - 6, 7, 3, '#7e7e84')
  px(ctx, tx + 1, y1 - 5, 5, 1, '#5b8fb0')
  ctx.strokeStyle = OUTLINE
  ctx.lineWidth = 1
  ctx.strokeRect(Math.round(tx) + 0.5, Math.round(y1 - 6) + 0.5, 6, 2)
}
