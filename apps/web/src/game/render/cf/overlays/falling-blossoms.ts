import { unitHash } from './weather-fx'
import type { LeafView } from './falling-leaves'

type Ctx = CanvasRenderingContext2D

/**
 * Blossom petals drifting down over the visible land in spring, the spring twin of the autumn
 * leaves. Each petal's path is a pure function of the clock and its index, so the same moment
 * always shows the same petals, and the layer is painted with the throttled ground pass.
 * Petals are lighter and slower than leaves, and sway more.
 */

export const PETAL_COUNT = 120
const PETAL_COLOURS = ['#f7c9d9', '#f2a7c3', '#fbe3ec', '#ffffff']

/** Position and tilt of petal `i` at wall-clock `t`, inside the view. */
export function petalAt(i: number, t: number, view: LeafView): { x: number; y: number; rot: number } {
  const w = Math.max(1, view.x1 - view.x0)
  const h = Math.max(1, view.y1 - view.y0)
  const fall = 0.006 + unitHash(i, 13) * 0.005
  const drift = 0.002 + unitHash(i, 17) * 0.003
  const y = view.y0 + ((unitHash(i, 19) * h + t * fall) % h)
  const sway = Math.sin(t * 0.0021 + i * 2.3) * 5
  const x = view.x0 + ((((unitHash(i, 23) * w + t * drift + sway) % w) + w) % w)
  return { x, y, rot: Math.sin(t * 0.0042 + i * 1.3) * 1.2 }
}

/** Paints the petals over the view. Nothing is drawn with no spring blossom (strength 0). */
export function paintFallingBlossoms(ctx: Ctx, view: LeafView, t: number, strength: number): void {
  if (strength <= 0) return
  ctx.save()
  ctx.globalAlpha = Math.min(1, strength) * 0.85
  for (let i = 0; i < PETAL_COUNT; i++) {
    const { x, y, rot } = petalAt(i, t, view)
    ctx.fillStyle = PETAL_COLOURS[i % PETAL_COLOURS.length]!
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(rot)
    ctx.fillRect(-1.5, -1, 3, 2)
    ctx.restore()
  }
  ctx.restore()
}
