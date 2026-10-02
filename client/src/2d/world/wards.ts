// The gods' wards: a soft golden dome over the ground they shelter, with
// motes drifting on its rim. It fades as the season it holds runs out, so a
// player can see when to renew it.

import type { WardInfo } from '../../types'

type Ctx = CanvasRenderingContext2D

/** How much of a ward is left: 1 when just cast, 0 as it lifts. */
export function wardStrength(ward: WardInfo, tick: number): number {
  const span = Math.max(1, ward.until - ward.cast)
  return Math.max(0, Math.min(1, (ward.until - tick) / span))
}

export function drawWard(
  ctx: Ctx,
  ward: WardInfo,
  cx: number,
  cy: number,
  tile: number,
  tick: number,
  t: number,
) {
  const strength = wardStrength(ward, tick)
  if (strength <= 0) return
  const r = ward.radius * tile
  const glow = 0.25 + strength * 0.55
  ctx.save()

  // The dome: a warm tint over the sheltered ground, brightest at its rim.
  const fill = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r)
  fill.addColorStop(0, `rgba(255, 226, 140, ${0.08 * glow})`)
  fill.addColorStop(0.75, `rgba(255, 226, 140, ${0.12 * glow})`)
  fill.addColorStop(1, `rgba(255, 214, 110, ${0.3 * glow})`)
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.ellipse(cx, cy, r, r * 0.7, 0, 0, Math.PI * 2)
  ctx.fill()

  // Its edge: a dark line for contrast under a bright, slowly pulsing rim.
  const pulse = 0.85 + 0.15 * Math.sin(t * 0.002)
  const rim = Math.max(2, tile * 0.28)
  ctx.lineWidth = rim + 2
  ctx.strokeStyle = `rgba(60, 40, 10, ${0.35 * glow})`
  ctx.beginPath()
  ctx.ellipse(cx, cy, r, r * 0.7, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.lineWidth = rim
  ctx.strokeStyle = `rgba(255, 220, 120, ${0.85 * glow * pulse})`
  ctx.stroke()

  // Motes drifting around the rim.
  const motes = 10
  for (let i = 0; i < motes; i++) {
    const a = (i / motes) * Math.PI * 2 + t * 0.00035
    const rise = (Math.sin(t * 0.003 + i * 1.7) + 1) * tile * 0.4
    const mx = cx + Math.cos(a) * r
    const my = cy + Math.sin(a) * r * 0.7 - rise
    ctx.fillStyle = `rgba(255, 244, 194, ${0.8 * glow})`
    const s = Math.max(2, Math.round(tile * 0.25))
    ctx.fillRect(Math.round(mx), Math.round(my), s, s)
  }
  ctx.restore()
}
