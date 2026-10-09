import { TILE } from '../../../model/palette'
import type { CfFrame } from './frame'
import { unitHash } from './weather-fx'

type Ctx = CanvasRenderingContext2D

/**
 * Birds crossing the sky by day, and bats flitting over the land at dusk and night. Both are
 * drawn over everything (the effects pass), so they read as high above the map rather than on
 * it. Each bird's and bat's path is a pure function of the clock and its index, so the same
 * moment always shows the same flock, and nothing has to be stored between frames.
 */

/** Flocks crossing the world at once, and the birds in each flock (a V of up to this many). */
export const FLOCK_COUNT = 6
export const FLOCK_SIZE = 5
/** Bats that flit at dusk and night. */
export const BAT_COUNT = 16

/** Pixels (world px, one tile is `TILE`) a flock moves per second. A flock takes minutes to cross. */
const FLOCK_SPEED_MIN = 3
const FLOCK_SPEED_RANGE = 3

export interface FlyerWindow {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** The fields of the world the flyers read (a loose shape, so tests can pass plain objects). */
export interface FlyerWorld {
  is_day: boolean
  day_progress?: number
  weather?: { kind: string; intensity?: number } | null
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

/**
 * How many birds are up, 0 to 1. Birds leave the roost after first light, fly through the
 * middle of the day, and settle as the sun goes down. A storm keeps them down; rain thins them.
 */
export function birdStrength(world: FlyerWorld): number {
  if (!world.is_day) return 0
  const dp = world.day_progress ?? 0.5
  const rise = clamp01((dp - 0.02) / 0.1)
  const settle = clamp01((0.62 - dp) / 0.1)
  const weather = world.weather?.kind ?? 'clear'
  const weatherKeep = weather === 'storm' ? 0.15 : weather === 'rain' ? 0.45 : 1
  return Math.min(rise, settle) * weatherKeep
}

/** How many bats are out, 0 to 1: they come out as the light goes and fill the night. */
export function batStrength(world: FlyerWorld): number {
  if (world.weather?.kind === 'storm') return 0
  if (!world.is_day) return 1
  const dp = world.day_progress ?? 0.5
  return clamp01((dp - 0.5) / 0.12) * 0.8
}

/** Where flock `f` is at wall-clock `t`: the leader's position and the direction it flies in (+1 right). */
export function flockAt(
  f: number,
  t: number,
  world: { W: number; H: number },
): { x: number; y: number; dir: number; speed: number } {
  const dir = unitHash(f, 41) < 0.5 ? -1 : 1
  const speed = FLOCK_SPEED_MIN + unitHash(f, 43) * FLOCK_SPEED_RANGE
  const pad = 60
  const span = world.W + pad * 2
  const start = unitHash(f, 47) * span
  // Position along the flight path, wrapped so a flock that leaves one side enters the other.
  const along = (((start + dir * speed * (t / 1000)) % span) + span) % span
  const x = dir > 0 ? along - pad : world.W + pad - along
  const lane = unitHash(f, 53) * world.H * 0.9 + world.H * 0.05
  const y = lane + Math.sin(t / 4200 + f * 1.9) * 5
  return { x, y, dir, speed }
}

/** Birds in the V of flock `f`: the leader in front, two wings behind, one rank deeper each time. */
function formationOffset(k: number, dir: number, t: number, f: number): { dx: number; dy: number } {
  if (k === 0) return { dx: 0, dy: 0 }
  const rank = Math.ceil(k / 2)
  const side = k % 2 === 1 ? -1 : 1
  const wobbleX = Math.sin(t / 1100 + k * 2.3 + f) * 0.8
  const wobbleY = Math.sin(t / 1700 + k * 1.3 + f * 0.7) * 0.6
  return { dx: -dir * rank * 4.5 + wobbleX, dy: side * rank * 2.2 + wobbleY }
}

function inWindow(x: number, y: number, w: FlyerWindow, pad: number): boolean {
  return x >= w.x0 - pad && x <= w.x1 + pad && y >= w.y0 - pad && y <= w.y1 + pad
}

/**
 * Flocks of birds crossing the sky, painted over the map. `strength` is `birdStrength` (0 hides
 * them); `view` is the visible window in painter px (world px, origin removed).
 */
export function paintBirdFlocks(
  ctx: Ctx,
  world: { W: number; H: number },
  view: FlyerWindow,
  t: number,
  strength: number,
): void {
  if (strength <= 0) return
  ctx.save()
  ctx.strokeStyle = '#1c2430'
  ctx.lineWidth = 1.1
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (let f = 0; f < FLOCK_COUNT; f++) {
    const lead = flockAt(f, t, world)
    if (!inWindow(lead.x, lead.y, view, 24)) continue
    for (let k = 0; k < FLOCK_SIZE; k++) {
      const { dx, dy } = formationOffset(k, lead.dir, t, f)
      const x = lead.x + dx
      const y = lead.y + dy
      // Wings beat at their own rhythm; the lift is always at least a quarter of a full beat.
      const beat = 0.5 + 0.5 * Math.sin(t / 95 + f * 1.7 + k * 0.4)
      const lift = 1.1 + beat * 1.6
      ctx.globalAlpha = strength * (0.62 + 0.2 * beat)
      ctx.beginPath()
      ctx.moveTo(x - 2.6, y - lift)
      ctx.lineTo(x, y)
      ctx.lineTo(x + 2.6, y - lift)
      ctx.stroke()
    }
  }
  ctx.restore()
}

/** Bats in their roaming circle at wall-clock `t`: their centre and how far their wings are spread. */
export function batAt(
  b: number,
  t: number,
  world: { W: number; H: number },
): { x: number; y: number; wing: number } {
  const hx = unitHash(b, 61) * world.W
  const hy = unitHash(b, 63) * world.H
  const speed = 0.0014 + unitHash(b, 65) * 0.0012
  const radius = 9 + unitHash(b, 67) * 12
  const x = hx + Math.sin(t * speed + b * 2.1) * radius + Math.sin(t * 0.0047 + b) * 2.5
  const y = hy + Math.cos(t * speed * 0.8 + b * 1.3) * radius * 0.7 + Math.sin(t * 0.0031 + b) * 1.5
  const wing = 1.8 + 1.2 * Math.abs(Math.sin(t * 0.026 + b * 0.9))
  return { x, y, wing }
}

/** Bats over the land, flitting in small irregular circles. `strength` is `batStrength`. */
export function paintBats(
  ctx: Ctx,
  world: { W: number; H: number },
  view: FlyerWindow,
  t: number,
  strength: number,
): void {
  if (strength <= 0) return
  ctx.save()
  ctx.strokeStyle = '#120e1c'
  ctx.lineWidth = 0.8
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.globalAlpha = Math.min(1, strength) * 0.85
  for (let b = 0; b < BAT_COUNT; b++) {
    const { x, y, wing } = batAt(b, t, world)
    if (!inWindow(x, y, view, 12)) continue
    ctx.beginPath()
    ctx.moveTo(x - wing, y + 0.5)
    ctx.lineTo(x - wing * 0.45, y - 0.9)
    ctx.lineTo(x, y)
    ctx.lineTo(x + wing * 0.45, y - 0.9)
    ctx.lineTo(x + wing, y + 0.5)
    ctx.stroke()
  }
  ctx.restore()
}

/** Birds by day and bats at dusk and night, over the visible part of the world. */
export function paintSkyFlyers(ctx: Ctx, f: CfFrame): void {
  const world = { W: f.W, H: f.H }
  const view: FlyerWindow = {
    x0: (f.bounds.c0 - f.ox) * TILE,
    y0: (f.bounds.r0 - f.oy) * TILE,
    x1: (f.bounds.c1 - f.ox) * TILE,
    y1: (f.bounds.r1 - f.oy) * TILE,
  }
  paintBirdFlocks(ctx, world, view, f.t, birdStrength(f.world))
  paintBats(ctx, world, view, f.t, batStrength(f.world))
}
