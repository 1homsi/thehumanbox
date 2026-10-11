// Visual-only traffic that shows what age a tribe lives in: rockets lift off
// from spaceports and aircraft cross the sky over modern tribes. Timing comes
// from the world tick and stable ids, so every viewer sees the same launch.

type Ctx = CanvasRenderingContext2D

/** Ticks between launches from one spaceport. */
export const LAUNCH_PERIOD = 2400
/** Ticks a rocket takes to climb out of sight. */
export const LAUNCH_TICKS = 260
/** Ticks after a launch before the next rocket stands on the pad. */
const PAD_EMPTY_TICKS = LAUNCH_TICKS + 520

function launchClock(id: number, tick: number): number {
  return (tick + ((id * 7919) % LAUNCH_PERIOD)) % LAUNCH_PERIOD
}

/** 0..1 while a spaceport's rocket is climbing, otherwise null. */
export function launchProgress(id: number, tick: number): number | null {
  const ph = launchClock(id, tick)
  return ph < LAUNCH_TICKS ? ph / LAUNCH_TICKS : null
}

/** True while the pad stands empty after a launch. */
export function padEmpty(id: number, tick: number): boolean {
  return launchClock(id, tick) < PAD_EMPTY_TICKS
}

function px(ctx: Ctx, x: number, y: number, w: number, h: number, c: string) {
  ctx.fillStyle = c
  ctx.fillRect(Math.round(x), Math.round(y), w, h)
}

/**
 * A rocket climbing from (x, y), the centre of the pad's surface, drawn at
 * the size of the one that stood on the pad, with its flame, a smoke column
 * behind it and a billow of exhaust around the pad at first.
 */
export function drawLaunch(ctx: Ctx, x: number, y: number, progress: number, t: number) {
  const W = 5
  const H = 30
  const rise = progress * progress * 300
  const base = y - rise
  const top = base - H
  // Exhaust billowing around the pad during lift-off.
  if (progress < 0.35) {
    const spread = 6 + progress * 60
    const a = 0.6 * (1 - progress / 0.35)
    for (let i = 0; i < 9; i++) {
      const ox = (i - 4) * spread * 0.25
      px(ctx, x + ox - 4, y - 5 - Math.abs(i - 4) * 1.5, 8, 6, `rgba(228,228,224,${a})`)
    }
  }
  // Smoke column from the pad up to the rocket, thinning with height.
  for (let sy = base + 6, k = 0; sy < y - 2; sy += 5, k++) {
    const w = 3 + Math.min(10, (y - sy) * 0.04 + k * 0.15)
    px(ctx, x - w / 2, sy, w, 4, `rgba(232,232,228,${Math.max(0.08, 0.55 - k * 0.025)})`)
  }
  // Flame flickers between two lengths.
  const flame = 7 + (Math.floor(t / 70) % 2) * 4
  px(ctx, x - 2, base, 4, flame, '#ffb23d')
  px(ctx, x - 1, base, 2, flame + 2, '#ffd34d')
  px(ctx, x - 1, base, 2, Math.max(2, flame - 4), '#fff4c2')
  // Body with its shaded side, nose cone, stripe and fins.
  px(ctx, x - W / 2, top + 4, W, H - 4, '#eef1f4')
  px(ctx, x, top + 4, W / 2, H - 4, 'rgba(0,0,0,0.12)')
  px(ctx, x - 1.5, top + 1, 3, 3, '#eef1f4')
  px(ctx, x - 0.5, top - 1, 1, 2, '#c8392b')
  px(ctx, x - W / 2, top + H * 0.35, W, 2, '#2f4f8a')
  px(ctx, x - W / 2 - 2, base - 6, 2, 6, '#c8392b')
  px(ctx, x + W / 2, base - 6, 2, 6, '#c8392b')
}

/** Ticks between flights over one tribe, and how long a crossing takes. */
const FLIGHT_PERIOD = 1100
const FLIGHT_TICKS = 420
/** Half the length of a flight path, in tiles. */
const FLIGHT_REACH = 150

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/**
 * Where a tribe's plane is, in tiles, and its heading — or null while no
 * plane is up. Each tribe's route crosses its main settlement at its own
 * angle, so neighbouring towns' flights cross.
 */
export function flightPosition(
  lineage: string,
  centre: { x: number; y: number },
  tick: number,
): { x: number; y: number; angle: number } | null {
  const h = hash(lineage)
  const ph = (tick + (h % FLIGHT_PERIOD)) % FLIGHT_PERIOD
  if (ph >= FLIGHT_TICKS) return null
  const angle = ((h >>> 8) % 360) * (Math.PI / 180)
  const along = -FLIGHT_REACH + (2 * FLIGHT_REACH * ph) / FLIGHT_TICKS
  return {
    x: centre.x + Math.cos(angle) * along,
    y: centre.y + Math.sin(angle) * along,
    angle,
  }
}

/** A small airliner at (x, y) in map pixels heading along `angle`, with contrails. */
export function drawPlane(ctx: Ctx, x: number, y: number, angle: number, scale: number) {
  // Its shadow falls straight down, far below: that reads as altitude.
  ctx.fillStyle = 'rgba(0,0,0,0.16)'
  ctx.fillRect(
    Math.round(x - 4 * scale),
    Math.round(y + 16 * scale),
    Math.round(9 * scale),
    Math.round(2 * scale),
  )
  ctx.save()
  ctx.translate(Math.round(x), Math.round(y))
  ctx.rotate(angle)
  ctx.scale(scale, scale)
  // Contrails behind both engines.
  const grad = ctx.createLinearGradient(-60, 0, -4, 0)
  grad.addColorStop(0, 'rgba(255,255,255,0)')
  grad.addColorStop(1, 'rgba(255,255,255,0.7)')
  ctx.fillStyle = grad
  ctx.fillRect(-60, -3, 56, 1)
  ctx.fillRect(-60, 2, 56, 1)
  // Fuselage, wings, tail.
  ctx.fillStyle = '#eef1f4'
  ctx.fillRect(-5, -1, 11, 2)
  ctx.fillRect(-1, -6, 3, 12)
  ctx.fillRect(-5, -3, 2, 6)
  ctx.fillStyle = '#9fb0c0'
  ctx.fillRect(-5, 0, 11, 1)
  ctx.fillStyle = '#2f4f8a'
  ctx.fillRect(5, -1, 1, 2)
  ctx.restore()
}

/** Length of an engine or a car, in map pixels: the engine's front is at +CAR / 2 along the heading. */
const CAR = 7

/**
 * A train at (x, y) in map pixels, its engine facing along `heading` (the step to the next track cell), or
 * east while it stands with nothing ahead. The engine and its cars are coloured by the owner's era tier;
 * a moving train puffs steam from its funnel, which trails back along the track as it rises.
 */
export function drawTrain(
  ctx: Ctx,
  x: number,
  y: number,
  heading: readonly [number, number] | null,
  tier: number,
  moving: boolean,
  t: number,
) {
  const style =
    tier >= 7
      ? { engine: '#e9f4f8', car: '#d6e6ee', trim: '#36d6ff' }
      : tier >= 6
        ? { engine: '#eef1f4', car: '#dfe3e6', trim: '#c8392b' }
        : { engine: '#2f3236', car: '#7a4f34', trim: '#c9a043' }
  const angle = heading ? Math.atan2(heading[1], heading[0]) : 0
  ctx.save()
  ctx.translate(Math.round(x), Math.round(y))
  ctx.rotate(angle)
  const cars = 3
  for (let i = 0; i < cars; i++) {
    const cx = -CAR / 2 - (i + 1) * CAR
    ctx.fillStyle = style.car
    ctx.fillRect(cx, -2.5, CAR - 1, 5)
    ctx.fillStyle = style.trim
    ctx.fillRect(cx, 1, CAR - 1, 1)
    ctx.fillStyle = 'rgba(255,224,150,0.85)'
    ctx.fillRect(cx + 1, -1.5, 1, 1)
    ctx.fillRect(cx + 4, -1.5, 1, 1)
  }
  ctx.fillStyle = style.engine
  ctx.fillRect(-CAR / 2, -3, CAR, 6)
  ctx.fillStyle = style.trim
  ctx.fillRect(CAR / 2 - 1, -3, 1, 6)
  // The funnel, and the steam it gives off while the engine is under way.
  const funnelX = CAR / 2 - 3
  ctx.fillStyle = '#1f2124'
  ctx.fillRect(funnelX, -5, 2, 2)
  if (moving) {
    for (let k = 0; k < 4; k++) {
      const rise = Math.floor(t / 120 + k) % 2
      ctx.fillStyle = `rgba(210,210,210,${0.45 - k * 0.1})`
      ctx.fillRect(funnelX - 2 - k * 4, -8 - k - rise, 3 + k, 2)
    }
  }
  ctx.restore()
}
