import type { WorldState } from '../../../../shared/types'
import { TILE } from '../../../model/palette'
import { TILE_ID } from '../../../model/terrain-ids'
import { landscapeHash } from '../../landscape-style'

type Ctx = CanvasRenderingContext2D

/**
 * Dew on the grass in the early morning: a fine glint on the blades of about one grass tile in
 * three, twinkling as the light catches them. It is strongest just after dawn and burns off by
 * mid-morning, and it is not drawn in winter (there the ground is frost, not dew). Each glint sits
 * on a fixed spot of its tile, so the dew stays put as the camera moves.
 */

/** The most visible tiles dew is painted for. */
export const DEW_MAX_TILES = 4000

/** Dew strength 0..1: 1 at first light, fading to 0 by a fifth of the way through the day. */
export function dewLevel(world: Pick<WorldState, 'is_day' | 'day_progress'>): number {
  if (!world.is_day) return 0
  const dp = world.day_progress ?? 0.5
  if (dp >= 0.2) return 0
  return Math.min(1, 1 - dp / 0.2)
}

/** Whether a grid cell gets a glint: grass, and one tile in three by its own hash. */
export function hasDew(tile: number | undefined, worldX: number, worldY: number): boolean {
  if (tile !== TILE_ID.GRASS) return false
  return landscapeHash(worldX, worldY) % 3 === 0
}

/**
 * Paints the dew glints of the visible grass. `level` is the dew strength (`dewLevel`), `ox` and `oy`
 * the grid origin in world tiles, and `bounds` the visible tiles in world coordinates.
 */
export function paintDew(
  ctx: Ctx,
  bounds: { c0: number; c1: number; r0: number; r1: number },
  ox: number,
  oy: number,
  t: number,
  level: number,
  tiles: ReadonlyArray<ReadonlyArray<number>> | undefined,
): void {
  if (level <= 0 || !tiles) return
  // Glints are sub-tile specks: past a few thousand visible tiles (the whole-world view) they are not worth the paint.
  if ((bounds.c1 - bounds.c0) * (bounds.r1 - bounds.r0) > DEW_MAX_TILES) return
  ctx.save()
  ctx.fillStyle = '#f4fbff'
  for (let wy = bounds.r0; wy < bounds.r1; wy++) {
    const row = tiles[wy - oy]
    if (!row) continue
    for (let wx = bounds.c0; wx < bounds.c1; wx++) {
      const tile = row[wx - ox]
      if (!hasDew(tile, wx, wy)) continue
      const h = landscapeHash(wx + 7, wy + 3)
      const twinkle = 0.4 + 0.6 * Math.abs(Math.sin(t * 0.0022 + (h & 1023) * 0.006))
      ctx.globalAlpha = Math.min(1, level) * twinkle * 0.8
      const px = (wx - ox) * TILE + 1 + ((h >>> 10) % (TILE - 2))
      const py = (wy - oy) * TILE + 1 + ((h >>> 16) % (TILE - 2))
      ctx.fillRect(px, py, 1, 1)
    }
  }
  ctx.restore()
}
