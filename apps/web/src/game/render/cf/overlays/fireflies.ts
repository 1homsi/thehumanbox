import { TILE } from '../../../model/palette'
import { TILE_ID } from '../../../model/terrain-ids'
import { unitHash } from './weather-fx'

type Ctx = CanvasRenderingContext2D

/**
 * Fireflies over the land on summer nights. They are fixed to the world (a firefly stays on its
 * patch of grass as the camera moves, like the stars), each one wanders a little and flashes on its
 * own rhythm: a short bright pulse and then dark. Painted with the throttled ground pass, only when
 * it is summer and dark, and never over water.
 */

/** Fireflies live in cells of this many tiles; one cell in three holds one. */
export const FIREFLY_CELL_TILES = 6

export interface Firefly {
  /** Position in tiles, in grid coordinates (grid column and row, fractional). */
  x: number
  y: number
  /** 0 when dark, 1 at the peak of a flash. */
  glow: number
}

/** The firefly of world cell (c, r) at wall-clock `t`, or null when that cell holds none. */
export function fireflyIn(c: number, r: number, t: number, originX: number, originY: number): Firefly | null {
  const id = r * 1000 + c
  if (unitHash(id, 3) > 0.34) return null
  const phase = unitHash(id, 17) * 6.28
  const wx = Math.sin(t * 0.00045 + phase) * 1.4
  const wy = Math.cos(t * 0.00063 + phase * 1.3) * 1.0
  const x = c * FIREFLY_CELL_TILES + unitHash(id, 5) * FIREFLY_CELL_TILES + wx - originX
  const y = r * FIREFLY_CELL_TILES + unitHash(id, 9) * FIREFLY_CELL_TILES + wy - originY
  // A flash: a sine raised to a high power is near zero for most of its cycle.
  const pulse = Math.max(0, Math.sin(t * 0.0029 + phase * 4.1))
  return { x, y, glow: Math.pow(pulse, 4) }
}

/** Whether a grid tile can hold a firefly: land, not water. */
export function isFireflyGround(tile: number | undefined): boolean {
  return tile !== undefined && tile !== TILE_ID.WATER && tile !== TILE_ID.FLOODED
}

/**
 * Paints the fireflies of the visible cells. `strength` is the night (0 in daylight). Each firefly
 * is a bright two-pixel core with a faint halo, its alpha following its flash.
 */
export function paintFireflies(
  ctx: Ctx,
  bounds: { c0: number; c1: number; r0: number; r1: number },
  originX: number,
  originY: number,
  t: number,
  strength: number,
  tiles?: ReadonlyArray<ReadonlyArray<number>>,
): void {
  if (strength <= 0) return
  ctx.save()
  const cell = FIREFLY_CELL_TILES
  for (let r = Math.floor(bounds.r0 / cell); r * cell < bounds.r1; r++) {
    for (let c = Math.floor(bounds.c0 / cell); c * cell < bounds.c1; c++) {
      const f = fireflyIn(c, r, t, originX, originY)
      if (!f || f.glow <= 0.02) continue
      if (tiles && !isFireflyGround(tiles[Math.floor(f.y)]?.[Math.floor(f.x)])) continue
      const px = f.x * TILE
      const py = f.y * TILE
      const a = Math.min(1, strength) * f.glow
      ctx.fillStyle = '#e8ff8a'
      ctx.globalAlpha = a * 0.25
      ctx.fillRect(px - 2, py - 2, 4, 4)
      ctx.globalAlpha = a
      ctx.fillRect(px - 1, py - 1, 2, 2)
    }
  }
  ctx.restore()
}
