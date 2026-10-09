import { TILE } from '../../../model/palette'
import { TILE_ID } from '../../../model/terrain-ids'
import { EDGE_EAST, EDGE_NORTH, EDGE_SOUTH, EDGE_WEST } from '../../../model/terrain-visuals'
import { unitHash } from './weather-fx'

type Ctx = CanvasRenderingContext2D

/**
 * Floodwater: a muddy sheen over every flooded cell, and a foam front where the flood meets dry
 * land. The front is a thin band on the flooded side of each dry edge. Its brightness is a crest
 * that rolls across the flood on a diagonal, so the foam reads as a wave running over the land
 * rather than a line that blinks. The pass is painted with the throttled ground layer.
 */

export const FLOOD_SHEEN = 'rgba(122,98,62,0.22)'
const FOAM_COLOUR = '#eaf6ff'
/** Foam band width in map pixels (the front is a band, not a line). */
const FOAM_WIDTH = 3
/** Crest speed in radians per ms (one crest about every 1.6 s). */
const CREST_SPEED = 0.0039
/** The crest is sharpened, so most of the time the front is thin and faint. */
const CREST_POWER = 3

export interface FloodView {
  /** Visible window in sim tiles (inclusive-exclusive), like `f.bounds`. */
  c0: number
  c1: number
  r0: number
  r1: number
  /** Sim coordinates of grid cell (0, 0). */
  ox: number
  oy: number
}

/** Mask of the sides of grid cell (row, col) that touch dry land. Off the grid counts as no land. */
export function dryEdges(tiles: ReadonlyArray<ReadonlyArray<number>>, row: number, col: number): number {
  const dry = (r: number, c: number) => {
    const v = tiles[r]?.[c]
    return v !== undefined && v !== TILE_ID.FLOODED && v !== TILE_ID.WATER
  }
  let m = 0
  if (dry(row - 1, col)) m |= EDGE_NORTH
  if (dry(row + 1, col)) m |= EDGE_SOUTH
  if (dry(row, col + 1)) m |= EDGE_EAST
  if (dry(row, col - 1)) m |= EDGE_WEST
  return m
}

/** Brightness (0..1) of the foam at grid cell (row, col) at clock `t` (ms): a crest rolling across. */
export function foamCrest(row: number, col: number, t: number): number {
  const phase = t * CREST_SPEED - (col * 0.7 + row * 0.45)
  return (0.5 + 0.5 * Math.sin(phase)) ** CREST_POWER
}

/** Paints the sheen and the foam front of every flooded cell in the view. */
export function paintFloodFront(
  ctx: Ctx,
  tiles: ReadonlyArray<ReadonlyArray<number>> | undefined,
  view: FloodView,
  t: number,
): void {
  if (!tiles) return
  ctx.save()
  ctx.fillStyle = FLOOD_SHEEN
  for (let r = view.r0; r < view.r1; r++) {
    const gr = r - view.oy
    const row = tiles[gr]
    if (!row) continue
    for (let c = view.c0; c < view.c1; c++) {
      const gc = c - view.ox
      if (row[gc] !== TILE_ID.FLOODED) continue
      const px = gc * TILE
      const py = gr * TILE
      ctx.fillRect(px, py, TILE, TILE)
      const edges = dryEdges(tiles, gr, gc)
      if (edges === 0) continue
      // Broken foam: about one cell in four is left out, the same cells every time.
      if (unitHash(gc * 3 + 1, gr * 5 + 2) < 0.25) continue
      const crest = foamCrest(gr, gc, t)
      if (crest < 0.05) continue
      ctx.globalAlpha = 0.3 + 0.6 * crest
      ctx.fillStyle = FOAM_COLOUR
      if (edges & EDGE_NORTH) ctx.fillRect(px, py, TILE, FOAM_WIDTH)
      if (edges & EDGE_SOUTH) ctx.fillRect(px, py + TILE - FOAM_WIDTH, TILE, FOAM_WIDTH)
      if (edges & EDGE_WEST) ctx.fillRect(px, py, FOAM_WIDTH, TILE)
      if (edges & EDGE_EAST) ctx.fillRect(px + TILE - FOAM_WIDTH, py, FOAM_WIDTH, TILE)
      ctx.fillStyle = FLOOD_SHEEN
      ctx.globalAlpha = 1
    }
  }
  ctx.restore()
}
