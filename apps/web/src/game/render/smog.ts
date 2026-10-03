// Smoke from industry: a brown-grey haze drifting downwind of factories,
// thicker where more chimneys crowd together, thinner where trees drink it.

import type { SmogInfo } from '../../shared/types'

type Ctx = CanvasRenderingContext2D

/** Tiles a source's haze reaches (the sim's `SMOG_REACH`). */
export const SMOG_REACH = 9

export function drawSmog(ctx: Ctx, source: SmogInfo, cx: number, cy: number, tile: number, t: number) {
  const strength = Math.min(2, source.s)
  if (strength <= 0) return
  const reach = SMOG_REACH * tile
  ctx.save()
  // A few puffs per source, drifting slowly east and breathing in and out.
  for (let i = 0; i < 5; i++) {
    const drift = ((t * 0.004 + i * 37) % (reach * 0.8)) - reach * 0.2
    const px = cx + drift + Math.sin(i * 2.1) * tile * 2
    const py = cy - tile * (1.5 + i * 0.6) + Math.cos(t * 0.0006 + i) * tile * 0.6
    const r = reach * (0.35 + i * 0.08)
    const a = Math.min(0.32, 0.17 * strength * (1 - i / 6))
    const g = ctx.createRadialGradient(px, py, 0, px, py, r)
    g.addColorStop(0, `rgba(96, 86, 74, ${a})`)
    g.addColorStop(1, 'rgba(96, 86, 74, 0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(px, py, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}
