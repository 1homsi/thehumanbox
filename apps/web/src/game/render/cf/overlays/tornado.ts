import { unitHash } from './weather-fx'

type Ctx = CanvasRenderingContext2D

/**
 * A tornado funnel that sometimes crosses the view in a storm: a column of grey ellipses that
 * narrows toward the ground, wobbles as it turns, and drifts across the land with a dark shadow
 * under it. Like the lightning, it is a pure function of the clock, so the same moment always
 * looks the same, and it is only drawn while a storm is on.
 */

export const TORNADO_SLOT_MS = 24000
export const TORNADO_MS = 9000
/** Height of the funnel, in painter px (about 8 tiles). */
const HEIGHT = 64
const RINGS = 9

export interface StrikeLikeView {
  cx: number
  cy: number
  hw: number
  hh: number
}

export interface Tornado {
  /** Milliseconds since the funnel touched down in the view. */
  age: number
  /** Ground position, painter px. */
  x: number
  y: number
}

/** The funnel visible at `t` in a storm of `intensity` (0..1), if any. Storms of 60 % and up spawn them. */
export function tornadoAt(t: number, intensity: number, view: StrikeLikeView): Tornado | null {
  if (intensity < 0.6) return null
  const slot = Math.floor(t / TORNADO_SLOT_MS)
  for (let s = slot - 1; s <= slot; s++) {
    if (unitHash(s, 91) >= 0.35) continue
    const start = s * TORNADO_SLOT_MS + unitHash(s, 93) * (TORNADO_SLOT_MS - TORNADO_MS)
    const age = t - start
    if (age < 0 || age >= TORNADO_MS) continue
    const k = age / TORNADO_MS
    return {
      age,
      x: view.cx + (unitHash(s, 95) - 0.5) * 1.2 * view.hw + (k - 0.5) * view.hw * 0.4,
      y: view.cy + (unitHash(s, 97) - 0.5) * 1.1 * view.hh,
    }
  }
  return null
}

/** How strongly the funnel shows at `age` (fades in and out at the ends). */
export function tornadoStrength(age: number): number {
  if (age < 0 || age >= TORNADO_MS) return 0
  return Math.min(1, Math.sin((Math.PI * age) / TORNADO_MS) * 2)
}

/** Paints the funnel and its ground shadow. `t` is wall-clock ms (the wobble runs on it). */
export function paintTornado(ctx: Ctx, tor: Tornado, t: number): void {
  const a = tornadoStrength(tor.age)
  if (a <= 0) return
  ctx.save()
  ctx.globalAlpha = 0.22 * a
  ctx.fillStyle = '#1a1c22'
  ctx.beginPath()
  ctx.ellipse(tor.x, tor.y + 2, 14, 4, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 0.8 * a
  for (let i = 0; i < RINGS; i++) {
    const k = i / (RINGS - 1)
    const y = tor.y - HEIGHT * k
    // Narrow toward the ground; the wobble is a slow sway that differs per ring.
    const rx = 3 + (1 - k) * 9 + 1.5 * Math.sin(t * 0.009 + i * 1.3)
    const sway = Math.sin(t * 0.005 + i * 0.8) * 3 * k
    // Each ring is a flat bar: the stepped silhouette of a pixel funnel, not stacked discs.
    ctx.fillStyle = i % 2 === 0 ? '#5d6470' : '#7b8290'
    const half = Math.max(1, rx)
    ctx.fillRect(tor.x + sway - half, y - 1.5, half * 2, 3)
  }
  ctx.restore()
}
