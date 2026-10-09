import { OUTLINE, gableRoof, outline, px, type P } from './kit'

/**
 * A barn: a red timber barn with a gambrel-looking gable, a big double door and a hay
 * loft window. Stores the fodder and tools that raise the herd and the fields.
 */
export function paintBarn(p: P) {
  const { x0, y1, w, h, rng } = p
  const wallH = h * 0.55
  const wallY = y1 - wallH
  const red = '#8a3a2e'
  px(p.ctx, x0, wallY, w, wallH, red)
  // Vertical board lines.
  for (let x = x0 + 3; x < x0 + w - 2; x += 4) px(p.ctx, Math.round(x), wallY, 1, wallH, '#6e2c22')
  outline(p.ctx, x0, wallY, w, wallH)
  gableRoof(p, x0, wallY, w, h * 0.42, '#4a4a50', 2)
  // Double door and a loft window in the gable.
  const dw = Math.max(6, w * 0.34)
  px(p.ctx, x0 + w / 2 - dw / 2, y1 - wallH * 0.8, dw, wallH * 0.8, '#e2d8bf')
  px(p.ctx, x0 + w / 2 - 0.5, y1 - wallH * 0.8, 1, wallH * 0.8, OUTLINE)
  px(p.ctx, x0 + w / 2 - 1, wallY - h * 0.16, 2, 2, '#f0e0a0')
  // A little hay by the door.
  px(p.ctx, x0 + 2, y1 - 2, 3, 2, rng() < 0.5 ? '#d8b860' : '#c8a850')
}

/**
 * A watermill: a timber mill house on the river bank with a wooden wheel turning in the
 * water. The wheel is the mark that tells it from a windmill.
 */
export function paintWatermill(p: P) {
  const { ctx, x0, y1, w, h } = p
  const wallH = h * 0.5
  const wallY = y1 - wallH
  // The wheel sits at the water's edge, on the side of the house.
  const wheelR = Math.max(4, Math.min(h * 0.28, w * 0.3))
  const cx = x0 + w - wheelR
  const cy = y1 - wheelR - 1
  ctx.fillStyle = '#4a6e7e'
  ctx.fillRect(x0 + w - 2, y1 - 6, 2, 6)
  px(ctx, x0, wallY, w * 0.7, wallH, '#8a6a4a')
  outline(ctx, x0, wallY, w * 0.7, wallH)
  gableRoof(p, x0, wallY, w * 0.7, h * 0.36, '#5a4030', 1)
  ctx.strokeStyle = '#6a4a2a'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(cx, cy, wheelR, 0, Math.PI * 2)
  ctx.stroke()
  ctx.lineWidth = 1
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx + Math.cos(a) * wheelR, cy + Math.sin(a) * wheelR)
    ctx.stroke()
  }
  ctx.strokeStyle = OUTLINE
}
