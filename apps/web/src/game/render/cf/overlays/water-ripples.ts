import { TILE } from '../../../model/palette'
import { TILE_ID } from '../../../model/terrain-ids'
import { unitHash } from './weather-fx'

type Ctx = CanvasRenderingContext2D

/**
 * Rings spreading out over open water: a fish rising, a breath of wind, a drop. A fixed share of
 * the water cells carry a spring; each spring sends a ring out every few seconds and fades it.
 * A ring is a pure function of the clock and the cell, so the same moment always shows the same
 * rings. Painted with the throttled ground layer, and only when the map is zoomed in enough to see
 * them (at the overview they would read as noise).
 */

/** One water cell in this many has a spring. */
export const RIPPLE_ONE_IN = 9
/** One ring's life, in ms: it grows from nothing to its full size over this time. */
export const RIPPLE_PERIOD_MS = 2600
/** Most springs drawn in one pass; the rest of the view is left still, not sampled badly. */
export const RIPPLE_LIMIT = 120

/** Where a ring is: its radius (px) and its opacity at wall-clock `t`, for the spring of `seed`. */
export function rippleAt(seed: number, t: number): { radius: number; alpha: number } {
  const phase = (t / RIPPLE_PERIOD_MS + unitHash(seed, 4)) % 1
  const p = phase < 0 ? phase + 1 : phase
  return { radius: 1 + p * TILE * 0.7, alpha: (1 - p) * 0.4 }
}

/** Paints the rings of every spring on visible open water. `tiles` is the grid's tile ids. */
export function paintWaterRipples(
  ctx: Ctx,
  tiles: ReadonlyArray<ReadonlyArray<number>> | undefined,
  view: { c0: number; c1: number; r0: number; r1: number; ox: number; oy: number },
  t: number,
): void {
  if (!tiles) return
  let drawn = 0
  ctx.save()
  ctx.strokeStyle = 'rgb(214,242,255)'
  ctx.lineWidth = 0.8
  for (let r = view.r0; r < view.r1 && drawn < RIPPLE_LIMIT; r++) {
    const row = tiles[r - view.oy]
    if (!row) continue
    for (let c = view.c0; c < view.c1 && drawn < RIPPLE_LIMIT; c++) {
      if (row[c - view.ox] !== TILE_ID.WATER) continue
      const seed = c * 1543 + r * 9973
      if (unitHash(seed, 1) * RIPPLE_ONE_IN >= 1) continue
      drawn++
      const { radius, alpha } = rippleAt(seed, t)
      const cx = (c - view.ox) * TILE + TILE / 2
      const cy = (r - view.oy) * TILE + TILE / 2
      ctx.globalAlpha = alpha
      ctx.beginPath()
      // A ring squashed to a flat ellipse, as seen from above at the map's angle.
      ctx.ellipse(cx, cy, radius, radius * 0.5, 0, 0, Math.PI * 2)
      ctx.stroke()
    }
  }
  ctx.restore()
}
