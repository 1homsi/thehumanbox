type Ctx = CanvasRenderingContext2D

/**
 * The sun low in the corner of the view at dawn and at dusk, the way the moon sits in the corner
 * at night: a warm disc on a soft halo, with rays that turn slowly. It is out of sight through
 * the middle of the day and at night, and it sits on the east side of the view at dawn and on the
 * west at dusk.
 */

/** How high the sun is in the corner, 0 (not shown) to 1 (full). */
export function sunStrength(world: { is_day: boolean; day_progress?: number }): number {
  if (!world.is_day) return 0
  const dp = world.day_progress ?? 0.5
  // Dawn: the sun is up for the first part of the day and sinks out of sight by mid-morning.
  if (dp < 0.3) return Math.min(1, Math.max(0, (0.22 - dp) / 0.1))
  // Dusk: it comes back low in the west as the day runs out.
  return Math.min(1, Math.max(0, (dp - 0.5) / 0.1))
}

/** The sun's place in a view: the east (left) corner at dawn, the west (right) corner at dusk. */
export function sunSide(dayProgress: number | undefined): -1 | 1 {
  return (dayProgress ?? 0.5) < 0.3 ? -1 : 1
}

/** Ray angle for ray `k` of `count` at wall-clock `t`: the rays turn slowly. */
export function rayAngle(k: number, count: number, t: number): number {
  return (k / count) * Math.PI * 2 + t * 0.00006
}

/**
 * The sun as a disc of `radius` at (cx, cy) with `count` rays, painted in the HUD pass. `strength`
 * is `sunStrength`; the halo spreads to about three radii.
 */
export function paintSun(
  ctx: Ctx,
  cx: number,
  cy: number,
  radius: number,
  t: number,
  strength: number,
): void {
  if (strength <= 0) return
  const count = 12
  ctx.save()
  ctx.globalAlpha = strength * 0.5
  ctx.fillStyle = '#ffd98a'
  ctx.beginPath()
  ctx.arc(cx, cy, radius * 3, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = strength * 0.85
  ctx.fillStyle = '#ffe9a8'
  for (let k = 0; k < count; k++) {
    const a = rayAngle(k, count, t)
    const long = k % 2 === 0 ? 2.1 : 1.7
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(a)
    ctx.fillRect(radius * 1.35, -0.5, (long - 1.35) * radius, 1)
    ctx.restore()
  }
  ctx.globalAlpha = strength
  ctx.fillStyle = '#ffd25a'
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#fff4c8'
  ctx.beginPath()
  ctx.arc(cx - radius * 0.3, cy - radius * 0.3, radius * 0.45, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}
