import type { WorldState } from '../../../../shared/types'
import { TILE } from '../../../model/palette'
import { unitHash } from './weather-fx'

type Ctx = CanvasRenderingContext2D

/**
 * The night sky over the map: stars that twinkle over the land while it is dark.
 */

/** Stars fill a cell of this many tiles; one cell in three holds one. */
const STAR_CELL_TILES = 9

/** 0 in daylight, 1 at night. */
export function nightLevel(world: Pick<WorldState, 'is_day'>): number {
  return world.is_day ? 0 : 1
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
