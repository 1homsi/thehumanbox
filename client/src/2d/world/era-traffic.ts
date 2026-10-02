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
