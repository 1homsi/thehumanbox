import { TILE } from '../../../model/palette'
import { unitHash } from './weather-fx'

type Ctx = CanvasRenderingContext2D

/**
 * Plague: a sickly green haze hangs round everyone who is infected. Each sick person breathes out
 * a soft cloud a few tiles wide; the clouds of a sick crowd run together into one haze. The cloud
 * swells and sinks on its own slow clock, so the haze moves rather than sitting still. Painted with
 * the throttled ground layer, under the people, so the sick still show clearly.
 */

/** A person counts as sick (and breathes out a cloud) from this infection level (0..1). */
export const PLAGUE_MIN_INFECTION = 0.15
/** Most clouds painted in one pass; the rest are left out. */
export const PLAGUE_SPOT_LIMIT = 400
const HAZE_OUTER = 'rgba(150,196,70,0.22)'
const HAZE_INNER = 'rgba(120,176,52,0.26)'

export interface PlagueOrganism {
  x: number
  y: number
  alive: boolean
  infection: number
}

export interface PlagueSpot {
  /** Centre in sim tiles. */
  x: number
  y: number
  /** Outer radius in sim tiles. */
  r: number
  /** Strength of the cloud, 0..1 (grows with the infection). */
  strength: number
}

export interface PlagueView {
  /** Visible window in sim tiles (inclusive-exclusive), like `f.bounds`. */
  c0: number
  c1: number
  r0: number
  r1: number
}

/** One sick person's cloud at clock `t` (ms), or null when they are not sick. */
export function plagueSpot(o: PlagueOrganism, t: number): PlagueSpot | null {
  if (!o.alive || !(o.infection >= PLAGUE_MIN_INFECTION)) return null
  const level = Math.min(1, o.infection)
  // Each cloud swells on its own phase, from where the person stands (stable while they stay put).
  const phase = unitHash(Math.floor(o.x * 3), Math.floor(o.y * 3)) * Math.PI * 2
  const swell = 1 + 0.14 * Math.sin(t * 0.0013 + phase)
  return {
    x: o.x,
    y: o.y,
    r: (1.6 + 1.6 * level) * swell,
    strength: level,
  }
}

/** Paints a sickly haze round every sick person in the view, at most `PLAGUE_SPOT_LIMIT` clouds. */
export function paintPlagueHaze(
  ctx: Ctx,
  organisms: ReadonlyArray<PlagueOrganism>,
  view: PlagueView,
  ox: number,
  oy: number,
  t: number,
): void {
  let painted = 0
  ctx.save()
  for (let i = 0; i < organisms.length && painted < PLAGUE_SPOT_LIMIT; i++) {
    const o = organisms[i]
    if (o.x < view.c0 - 3 || o.x > view.c1 + 3 || o.y < view.r0 - 3 || o.y > view.r1 + 3) continue
    const spot = plagueSpot(o, t)
    if (!spot) continue
    painted++
    const cx = (spot.x - ox) * TILE + TILE / 2
    const cy = (spot.y - oy) * TILE + TILE / 2
    const r = spot.r * TILE
    ctx.globalAlpha = 0.4 + 0.6 * spot.strength
    ctx.fillStyle = HAZE_OUTER
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = HAZE_INNER
    ctx.beginPath()
    ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}
