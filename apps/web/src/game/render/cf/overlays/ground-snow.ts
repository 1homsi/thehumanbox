import { TILE } from '../../../model/palette'
import { TILE_ID } from '../../../model/terrain-ids'
import { unitHash } from './weather-fx'

type Ctx = CanvasRenderingContext2D

/**
 * Snow on the ground through winter: the land is dusted in patches that spread as the winter
 * deepens and melt away with the spring. A hard winter lays more snow than an ordinary one. The
 * patches are clustered (a coarse hash decides where the snow gathers), so they read as drifts, not
 * as salt. Each snowed grass cell gets a thin white base and a few specks; the pass is painted with
 * the throttled ground layer, under the people and buildings.
 */

const SNOW_BASE = 'rgba(236,244,247,0.28)'
const SNOW_SPECK = 'rgba(250,252,253,0.9)'
/** Cells per drift: the snow gathers in blocks this many cells across. */
const DRIFT = 4
/** Specks on each snowed cell. */
const SPECKS = 3

export interface SnowView {
  /** Visible window in sim tiles (inclusive-exclusive), like `f.bounds`. */
  c0: number
  c1: number
  r0: number
  r1: number
  /** Sim coordinates of grid cell (0, 0). */
  ox: number
  oy: number
}

/**
 * The share of grass that is snowed under the season (0..1). Winter ('scarcity') lays a light
 * dusting that thickens through the season; a hard winter starts from a heavier cover. Other
 * seasons have no snow on the ground.
 */
export function snowCover(season: string, progress: number): number {
  const p = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0))
  if (season === 'scarcity') return 0.08 + 0.32 * p
  if (season === 'hard_winter') return 0.25 + 0.35 * p
  return 0
}

/** Whether grid cell (row, col) has snow at this cover: grass only, gathered in drifts. */
export function isSnowed(tid: number, row: number, col: number, cover: number): boolean {
  if (cover <= 0 || (tid !== TILE_ID.GRASS && tid !== TILE_ID.FOOD)) return false
  const drift = unitHash(Math.floor(col / DRIFT) + 31, Math.floor(row / DRIFT) + 17)
  // A drift can hold its cover above the mean and another below; the cell's own hash picks it.
  const local = unitHash(col * 3 + 5, row * 7 + 2)
  return local < cover * (0.5 + drift)
}

/** Paints the snow of every snowed grass cell in the view. */
export function paintGroundSnow(
  ctx: Ctx,
  tiles: ReadonlyArray<ReadonlyArray<number>> | undefined,
  view: SnowView,
  season: string,
  progress: number,
): void {
  const cover = snowCover(season, progress)
  if (cover <= 0 || !tiles) return
  ctx.save()
  for (let r = view.r0; r < view.r1; r++) {
    const row = r - view.oy
    const tr = tiles[row]
    if (!tr) continue
    for (let c = view.c0; c < view.c1; c++) {
      const col = c - view.ox
      if (!isSnowed(tr[col] ?? 0, row, col, cover)) continue
      const px = col * TILE
      const py = row * TILE
      ctx.fillStyle = SNOW_BASE
      ctx.fillRect(px, py, TILE, TILE)
      ctx.fillStyle = SNOW_SPECK
      for (let k = 0; k < SPECKS; k++) {
        const sx = px + Math.floor(unitHash(col * 11 + k, row + 3) * (TILE - 2))
        const sy = py + Math.floor(unitHash(row * 13 + k, col + 9) * (TILE - 2))
        ctx.fillRect(sx, sy, 2, 2)
      }
    }
  }
  ctx.restore()
}
