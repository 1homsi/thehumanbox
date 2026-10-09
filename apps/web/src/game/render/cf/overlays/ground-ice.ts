import { TILE } from '../../../model/palette'
import { isPermanentWaterTile } from '../../../model/terrain-ids'
import { unitHash } from './weather-fx'
import type { SnowView } from './ground-snow'

type Ctx = CanvasRenderingContext2D

/**
 * Ice at the edges of the lakes and the sea in winter. Cold water freezes from the shore inwards:
 * a lake's edge cells (permanent water with land beside them) take a pale skin first, and a hard
 * winter spreads it a cell further out. Each iced cell gets a light body, a bright rim on the
 * side that meets the land and a few hairline cracks. Painted with the throttled ground pass,
 * above the water and under the boats and people.
 */

const ICE_BODY = 'rgba(238,248,252,0.92)'
const ICE_RIM = 'rgba(245,252,255,0.9)'
const ICE_CRACK = 'rgba(92,128,150,0.5)'
/** Cracks on each iced cell. */
const CRACKS = 2

/**
 * How much of the shore has frozen (0..1) under the season. The ordinary winter freezes the
 * shore late in the season; a hard winter freezes it from the start and thicker. Other seasons
 * melt it.
 */
export function iceCover(season: string, progress: number): number {
  const p = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0))
  if (season === 'scarcity') return Math.max(0, Math.min(1, (p - 0.2) / 0.5))
  if (season === 'hard_winter') return 0.6 + 0.4 * p
  return 0
}

/** Whether a grid cell is permanent water with land on one side: the shore. */
export function isShore(tiles: ReadonlyArray<ReadonlyArray<number>>, row: number, col: number): boolean {
  if (!isPermanentWaterTile(tiles[row]?.[col])) return false
  const around = [tiles[row - 1]?.[col], tiles[row + 1]?.[col], tiles[row]?.[col - 1], tiles[row]?.[col + 1]]
  return around.some((t) => t !== undefined && !isPermanentWaterTile(t))
}

/**
 * Whether a shore cell has frozen at this cover. Each cell's own hash decides when, so the edge
 * goes white unevenly rather than in a line.
 */
export function isIced(row: number, col: number, cover: number): boolean {
  if (cover <= 0) return false
  return unitHash(col * 5 + 17, row * 3 + 29) < cover
}

/** Paints the ice on the shore cells of the view. */
export function paintGroundIce(
  ctx: Ctx,
  tiles: ReadonlyArray<ReadonlyArray<number>> | undefined,
  view: SnowView,
  season: string,
  progress: number,
): void {
  const cover = iceCover(season, progress)
  if (cover <= 0 || !tiles) return
  ctx.save()
  for (let r = view.r0; r < view.r1; r++) {
    const row = r - view.oy
    if (!tiles[row]) continue
    for (let c = view.c0; c < view.c1; c++) {
      const col = c - view.ox
      if (!isShore(tiles, row, col)) continue
      if (!isIced(row, col, cover)) continue
      paintIcedCell(ctx, tiles, row, col)
    }
  }
  ctx.restore()
}

/** One iced cell: a pale body, a bright rim on the land side, and a few cracks. */
function paintIcedCell(
  ctx: Ctx,
  tiles: ReadonlyArray<ReadonlyArray<number>>,
  row: number,
  col: number,
): void {
  const px = col * TILE
  const py = row * TILE
  ctx.fillStyle = ICE_BODY
  ctx.fillRect(px, py, TILE, TILE)
  ctx.fillStyle = ICE_RIM
  const land = (r: number, c: number) => {
    const t = tiles[r]?.[c]
    return t !== undefined && !isPermanentWaterTile(t)
  }
  if (land(row - 1, col)) ctx.fillRect(px, py, TILE, 1)
  if (land(row + 1, col)) ctx.fillRect(px, py + TILE - 1, TILE, 1)
  if (land(row, col - 1)) ctx.fillRect(px, py, 1, TILE)
  if (land(row, col + 1)) ctx.fillRect(px + TILE - 1, py, 1, TILE)
  ctx.fillStyle = ICE_CRACK
  for (let k = 0; k < CRACKS; k++) {
    const sx = px + 1 + Math.floor(unitHash(col * 7 + k, row + 41) * (TILE - 3))
    const sy = py + 1 + Math.floor(unitHash(row * 9 + k, col + 23) * (TILE - 3))
    ctx.fillRect(sx, sy, 2, 1)
    ctx.fillRect(sx + 1, sy + 1, 1, 1)
  }
}
