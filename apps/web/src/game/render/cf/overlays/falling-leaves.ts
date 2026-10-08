import { unitHash } from './weather-fx'

type Ctx = CanvasRenderingContext2D

/**
 * Leaves drifting down over the visible land in autumn. Each leaf's path is a pure function of the
 * clock and its index, so the same moment always shows the same leaves, and the layer is painted
 * with the throttled ground pass (about 15 times a second), not on every display frame.
 */

export const LEAF_COUNT = 90
const LEAF_COLOURS = ['#c85a2a', '#e0a53a', '#b4462c', '#d68a32']

export interface LeafView {
  /** Visible window in painter px. */
  x0: number
  y0: number
  x1: number
  y1: number
}

/** Position and tilt of leaf `i` at wall-clock `t`, inside the view. */
export function leafAt(i: number, t: number, view: LeafView): { x: number; y: number; rot: number } {
  const w = Math.max(1, view.x1 - view.x0)
  const h = Math.max(1, view.y1 - view.y0)
  const fall = 0.01 + unitHash(i, 3) * 0.008
  const drift = 0.004 + unitHash(i, 5) * 0.004
  const y = view.y0 + ((unitHash(i, 7) * h + t * fall) % h)
  const x = view.x0 + ((((unitHash(i, 11) * w + t * drift + Math.sin(t * 0.0008 + i) * 6) % w) + w) % w)
  return { x, y, rot: Math.sin(t * 0.003 + i * 1.7) * 0.9 }
}

/** Paints the leaves over the view (only where the view is visible). */
export function paintFallingLeaves(ctx: Ctx, view: LeafView, t: number, strength: number): void {
  if (strength <= 0) return
  ctx.save()
  ctx.globalAlpha = Math.min(1, strength) * 0.9
  for (let i = 0; i < LEAF_COUNT; i++) {
    const { x, y, rot } = leafAt(i, t, view)
    ctx.fillStyle = LEAF_COLOURS[i % LEAF_COLOURS.length]
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(rot)
    ctx.fillRect(-1.5, -0.75, 3, 1.5)
    ctx.restore()
  }
  ctx.restore()
}
