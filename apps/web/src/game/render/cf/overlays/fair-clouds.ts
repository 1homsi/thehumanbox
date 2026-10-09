import { TILE } from '../../../model/palette'
import { drawCloudShape } from '../../decorations'
import type { CfFrame } from './frame'

type Ctx = CanvasRenderingContext2D

/**
 * Fair-weather clouds by day. In clear weather a few white cumulus drift slowly across the land,
 * and each one throws a soft shadow onto the ground a little south-east of it (the sun is in the
 * north-west). The shadows go over the trees and the grass but under the buildings and people,
 * like the rain clouds do, and the shapes are the same pixel puffs the storm clouds use.
 */

export const FAIR_CLOUD_COUNT = 5

/** How much fair-weather cloud is up, 0 to 1: none at night, none in rain, fades at dawn and dusk. */
export function fairCloudStrength(world: {
  is_day: boolean
  day_progress?: number
  weather?: { kind: string; intensity?: number } | null
}): number {
  if (!world.is_day) return 0
  if ((world.weather?.kind ?? 'clear') !== 'clear') return 0
  const dp = world.day_progress ?? 0.5
  const rise = Math.min(1, Math.max(0, (dp - 0.03) / 0.09))
  const settle = Math.min(1, Math.max(0, (0.7 - dp) / 0.12))
  return Math.min(rise, settle)
}

export interface CloudPlace {
  /** Centre of the cloud, world px. */
  x: number
  y: number
  w: number
  h: number
  seed: number
}

/** Where fair cloud `i` is at wall-clock `t` on a world `W` px wide and `H` px tall. */
export function fairCloudAt(i: number, t: number, W: number, H: number): CloudPlace {
  const seed = (i + 3) * 149
  const baseX = (((seed * 73) % 1000) / 1000) * W
  const baseY = ((((seed * 41) % 600) / 600) * 0.55 + 0.04) * H
  const speed = 0.009 + (i % 4) * 0.004
  const x = ((baseX + t * speed) % (W + 360)) - 180
  const w = W * (0.075 + (i % 3) * 0.04)
  const h = w * (0.3 + (i % 2) * 0.08)
  return { x, y: baseY, w, h, seed: i * 7 + 3 }
}

/**
 * The clouds and their shadows, painted over the visible window. `strength` is `fairCloudStrength`.
 * The shadow is drawn first, so the cloud's own puffs sit over it.
 */
export function paintFairClouds(
  ctx: Ctx,
  world: { W: number; H: number },
  view: {
    x0: number
    y0: number
    x1: number
    y1: number
  },
  t: number,
  strength: number,
): void {
  if (strength <= 0) return
  for (let i = 0; i < FAIR_CLOUD_COUNT; i++) {
    const c = fairCloudAt(i, t, world.W, world.H)
    const sx = c.x + c.w * 0.04
    const sy = c.y + c.h * 0.9
    if (sx + c.w < view.x0 || sx - c.w > view.x1 || sy + c.h < view.y0 || sy - c.h > view.y1) continue
    drawCloudShape(ctx, sx, sy, c.w, c.h * 0.8, strength * 0.5, '22,32,24', c.seed + 11)
    drawCloudShape(ctx, c.x, c.y, c.w, c.h, strength * 0.5, '255,255,255', c.seed)
  }
}

/** The fair-weather clouds over the view of this frame (painted in the ground pass). */
export function paintFairCloudsFrame(ctx: Ctx, f: CfFrame): void {
  const view = {
    x0: (f.bounds.c0 - f.ox) * TILE,
    y0: (f.bounds.r0 - f.oy) * TILE,
    x1: (f.bounds.c1 - f.ox) * TILE,
    y1: (f.bounds.r1 - f.oy) * TILE,
  }
  paintFairClouds(ctx, { W: f.W, H: f.H }, view, f.t, fairCloudStrength(f.world))
}
