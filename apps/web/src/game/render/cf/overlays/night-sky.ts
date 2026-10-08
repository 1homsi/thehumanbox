import type { CosmosState, WorldState } from '../../../../shared/types'
import { TILE } from '../../../model/palette'
import { unitHash } from './weather-fx'

type Ctx = CanvasRenderingContext2D

/**
 * The night sky over the map: stars that twinkle over the land while it is dark, and the moon in
 * the corner of the view, lit for its phase. The phase comes from the simulation's calendar
 * (`cosmos`), so the moon on the map is the same moon the header shows.
 */

/** Stars fill a cell of this many tiles; one cell in three holds one. */
const STAR_CELL_TILES = 9

/** 0 in daylight, 1 at night. */
export function nightLevel(world: Pick<WorldState, 'is_day'>): number {
  return world.is_day ? 0 : 1
}

/** How much of the moon is lit (0 none, 1 full) and which side (waxing lights the right). */
export function moonLight(
  phase: CosmosState['moon_phase'] | undefined,
  illum: number | undefined,
): { lit: number; waxing: boolean } {
  const k = Math.max(0, Math.min(1, illum ?? 0.5))
  const waxing = phase === 'waxing_crescent' || phase === 'first_quarter' || phase === 'waxing_gibbous'
  return { lit: k, waxing: waxing || phase === 'new_moon' }
}

/** The stars of the visible window at wall-clock `t` (cell hash fixed, twinkle by time). */
export function paintStars(
  ctx: Ctx,
  bounds: { c0: number; c1: number; r0: number; r1: number },
  ox: number,
  oy: number,
  t: number,
  night: number,
): void {
  if (night <= 0) return
  const cell = STAR_CELL_TILES
  ctx.save()
  for (let r = Math.floor(bounds.r0 / cell); r * cell < bounds.r1; r++) {
    for (let c = Math.floor(bounds.c0 / cell); c * cell < bounds.c1; c++) {
      const id = r * 1000 + c
      if (unitHash(id, 3) > 0.34) continue
      const x = (c * cell + unitHash(id, 5) * cell - ox) * TILE
      const y = (r * cell + unitHash(id, 9) * cell - oy) * TILE
      const twinkle = 0.45 + 0.55 * Math.abs(Math.sin(t * 0.0009 + unitHash(id, 17) * 6.28))
      ctx.globalAlpha = night * twinkle * 0.8
      ctx.fillStyle = unitHash(id, 23) > 0.8 ? '#ffe9b0' : '#ffffff'
      ctx.fillRect(x, y, 2, 2)
    }
  }
  ctx.restore()
}

/**
 * The moon as a pixel disc of radius `radius` (painter units) centred at (cx, cy): a dark disc, then
 * the lit part row by row, the terminator set by the lit fraction.
 */
export function paintMoon(
  ctx: Ctx,
  cx: number,
  cy: number,
  radius: number,
  light: { lit: number; waxing: boolean },
): void {
  const dark = '#262e40'
  const bright = '#f3ecd2'
  ctx.save()
  const rows = Math.max(4, Math.round(radius * 2))
  const step = (radius * 2) / rows
  for (let i = 0; i < rows; i++) {
    const y = -radius + (i + 0.5) * step
    const half = Math.sqrt(Math.max(0, radius * radius - y * y))
    if (half <= 0) continue
    // The terminator: 1 at a new moon (all dark), 0 at full (the whole half lit by the terminator).
    const edge = half * (1 - 2 * light.lit)
    ctx.globalAlpha = 0.9
    ctx.fillStyle = dark
    ctx.fillRect(cx - half, cy + y - step / 2, half * 2, step + 0.5)
    if (light.lit <= 0) continue
    ctx.fillStyle = bright
    if (light.waxing) {
      // Lit from the terminator to the right limb.
      const x0 = cx + Math.max(-half, Math.min(half, edge))
      ctx.fillRect(x0, cy + y - step / 2, cx + half - x0, step + 0.5)
    } else {
      const x1 = cx - Math.max(-half, Math.min(half, edge))
      ctx.fillRect(cx - half, cy + y - step / 2, x1 - (cx - half), step + 0.5)
    }
  }
  ctx.restore()
}
