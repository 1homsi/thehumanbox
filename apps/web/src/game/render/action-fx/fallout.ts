// Fallout a bomb left: a sickly olive stain over the poisoned ground, a broken pixel rim marking its
// edge, and motes of ash drifting up out of it. It pales as the fallout settles, so a player can see
// when the land is safe again.

import type { FalloutInfo } from '../../../shared/types'

type Ctx = CanvasRenderingContext2D

/** How much of the fallout is left: 1 when fresh, 0 as it lifts. */
export function falloutStrength(zone: FalloutInfo, tick: number): number {
  const span = Math.max(1, zone.until - zone.cast)
  return Math.max(0, Math.min(1, (zone.until - tick) / span))
}

/** Draws one fallout zone centred on (cx, cy), in world pixels. `t` is the animation clock in ms. */
export function drawFallout(
  ctx: Ctx,
  zone: FalloutInfo,
  cx: number,
  cy: number,
  tile: number,
  tick: number,
  t: number,
) {
  const strength = falloutStrength(zone, tick)
  if (strength <= 0) return
  const r = zone.radius * tile
  const ry = r * 0.72
  ctx.save()
  // The stain: one flat tone, no glow, rows of whole pixels so its edge stays crisp.
  ctx.fillStyle = `rgba(150, 160, 58, ${0.1 + 0.16 * strength})`
  for (let y = -Math.floor(ry); y <= ry; y += 1) {
    const w = Math.floor(r * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))))
    if (w > 0) ctx.fillRect(Math.round(cx) - w, Math.round(cy) + y, w * 2, 1)
  }
  // A dashed rim of pixels, the warning line round the poisoned ground.
  const steps = Math.max(24, Math.round(r / 3))
  ctx.fillStyle = `rgba(196, 206, 72, ${0.35 + 0.5 * strength})`
  for (let i = 0; i < steps; i += 2) {
    const a = (i / steps) * Math.PI * 2
    ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * ry), 2, 2)
  }
  // Ash motes rising from the ground, more while it is fresh.
  const motes = Math.round(6 + 18 * strength)
  for (let i = 0; i < motes; i++) {
    const a = i * 2.39996
    const d = Math.sqrt(((i * 0.6180339) % 1) + 0.02) * r * 0.9
    const life = (((t * 0.00025 + i * 0.137) % 1) + 1) % 1
    const mx = cx + Math.cos(a) * d
    const my = cy + Math.sin(a) * d * 0.72 - life * tile * 2
    ctx.fillStyle =
      i % 3 === 0 ? `rgba(214, 222, 120, ${0.8 * (1 - life)})` : `rgba(96, 104, 54, ${0.7 * (1 - life)})`
    ctx.fillRect(Math.round(mx), Math.round(my), 1, 1)
  }
  ctx.restore()
}
