import type { Building } from '../../../../shared/types'
import { TILE } from '../../../model/palette'
import { unitHash } from './weather-fx'

type Ctx = CanvasRenderingContext2D

/**
 * Smoke rising from the chimneys of finished homes: each home has three soft grey puffs that climb
 * from the top of its chimney, spread and thin out, one after another, on a cycle of about 2.4 s.
 * Each home's puffs start at their own point in the cycle, so the smoke of a village does not pulse
 * in step. Drawn above the buildings and under the people. Building sites send no smoke.
 */

/** The chimney's top, in tiles relative to the home's top-left corner: near the right-hand end of the roof. */
export const CHIMNEY_OFFSET_X = -0.75
export const CHIMNEY_OFFSET_Y = -0.5
/** Puffs per chimney, and the length of one puff's climb, in ms. */
export const PUFFS_PER_CHIMNEY = 3
export const PUFF_CYCLE_MS = 2400
/** Homes past this many visible tiles get no smoke (the whole-world view). */
export const SMOKE_MAX_TILES = 4000

export interface Puff {
  /** Centre in painter px, relative to the grid origin. */
  x: number
  y: number
  /** Radius in painter px. */
  r: number
  /** Alpha 0..1 before the global strength is applied. */
  a: number
}

/** Puff `k` of a home at wall-clock `t`: where it is, how big and how strong (it fades as it climbs). */
export function puffOf(
  home: Pick<Building, 'id' | 'x' | 'y' | 'fw'>,
  k: number,
  t: number,
  ox: number,
  oy: number,
): Puff {
  const fw = home.fw ?? 2
  const phase0 = unitHash(home.id, 31 + k)
  const phase = (((t / PUFF_CYCLE_MS + phase0 + k / PUFFS_PER_CHIMNEY) % 1) + 1) % 1
  const cx = (home.x + fw) * TILE + CHIMNEY_OFFSET_X * TILE - ox * TILE
  const cy = home.y * TILE + CHIMNEY_OFFSET_Y * TILE - oy * TILE
  const drift = Math.sin(phase * 3 + home.id * 0.7) * 2.5 * phase
  return {
    x: cx + drift,
    y: cy - phase * 14,
    r: 1.2 + phase * 3.2,
    a: (1 - phase) * 0.7,
  }
}

/**
 * Whether a building sends smoke: a finished home with a chimney. The wire names the function in
 * lower case (`housing`); a tent has a cook fire, not a chimney.
 */
export function sendsSmoke(
  b: Pick<Building, 'function' | 'construction_progress'> & { kind?: string },
): boolean {
  return (
    String(b.function).toLowerCase() === 'housing' && b.kind !== 'tent' && (b.construction_progress ?? 1) >= 1
  )
}

/**
 * Paints the chimney smoke of the homes whose footprint is in the visible window. `bounds` is the
 * visible window in world tiles and `ox`, `oy` the grid origin in world tiles.
 */
export function paintChimneySmoke(
  ctx: Ctx,
  bounds: { c0: number; c1: number; r0: number; r1: number },
  ox: number,
  oy: number,
  buildings: readonly Building[] | undefined,
  t: number,
): void {
  if (!buildings || buildings.length === 0) return
  if ((bounds.c1 - bounds.c0) * (bounds.r1 - bounds.r0) > SMOKE_MAX_TILES) return
  ctx.save()
  ctx.fillStyle = '#e4e8ec'
  for (const b of buildings) {
    if (!sendsSmoke(b)) continue
    const fw = b.fw ?? 2
    if (b.x + fw < bounds.c0 || b.x > bounds.c1 || b.y + (b.fh ?? 2) < bounds.r0 || b.y > bounds.r1) continue
    for (let k = 0; k < PUFFS_PER_CHIMNEY; k++) {
      const p = puffOf(b, k, t, ox, oy)
      ctx.globalAlpha = p.a
      ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2)
    }
  }
  ctx.restore()
}
