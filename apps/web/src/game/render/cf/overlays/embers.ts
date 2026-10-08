import { TILE } from '../../../model/palette'
import { TILE_ID } from '../../../model/terrain-ids'
import { unitHash } from './weather-fx'

type Ctx = CanvasRenderingContext2D

/**
 * Sparks rising off wildfires. Each burning cell throws a few embers that climb, drift and fade
 * over a short life. An ember's place is a pure function of the clock and its seed, so the same
 * moment always shows the same sparks; the pass is painted with the throttled ground layer.
 */

/** A cell counts as burning from this fire intensity (0..1). */
export const EMBER_FIRE_MIN = 0.25
/** Most burning cells that throw embers in one pass; the rest are left out, not sampled badly. */
export const EMBER_CELL_LIMIT = 80
const EMBERS_PER_CELL = 3
/** One ember's life, in ms. */
export const EMBER_LIFE_MS = 1300
const EMBER_COLOURS = ['#ffd27a', '#ff9a3c', '#ffb85a', '#ff7a2a']

export interface EmberView {
  /** Visible window in sim tiles (inclusive-exclusive), like `f.bounds`. */
  c0: number
  c1: number
  r0: number
  r1: number
  /** Sim coordinates of grid cell (0, 0). */
  ox: number
  oy: number
}

export interface EmberPose {
  /** Painter px, relative to the grid's origin (the same space the ground layer paints in). */
  x: number
  y: number
  /** 0 at birth, 1 at the end of its life. */
  age: number
}

/** Where ember `e` of a cell at painter px (`cx`, `cy`) is at wall-clock `t`, and how old it is. */
export function emberAt(seed: number, e: number, t: number, cx: number, cy: number): EmberPose {
  const phase = (t / EMBER_LIFE_MS + unitHash(seed, e * 3 + 1)) % 1
  const age = phase < 0 ? phase + 1 : phase
  const sway = Math.sin(age * 6 + unitHash(seed, e * 3 + 2) * 6.28) * 2.5
  const rise = age * (TILE * 2.6)
  const drift = (unitHash(seed, e * 3 + 3) - 0.5) * TILE * 0.5 * age
  return { x: cx + sway + drift, y: cy - rise, age }
}

/**
 * Paints embers over every cell in the view whose heat is at least `heatAt`'s threshold (`heatAt`
 * returns 0 for a cold cell). Grid coordinates are `row - oy` and `col - ox`.
 */
function paintEmberCells(
  ctx: Ctx,
  heatAt: (gridRow: number, gridCol: number) => number,
  view: EmberView,
  t: number,
  perCell: number,
): void {
  let cells = 0
  ctx.save()
  for (let r = view.r0; r < view.r1 && cells < EMBER_CELL_LIMIT; r++) {
    for (let c = view.c0; c < view.c1 && cells < EMBER_CELL_LIMIT; c++) {
      const heat = heatAt(r - view.oy, c - view.ox)
      if (heat < EMBER_FIRE_MIN) continue
      cells++
      const cx = (c - view.ox) * TILE + TILE / 2
      const cy = (r - view.oy) * TILE + TILE * 0.3
      const seed = c * 7919 + r * 104729
      for (let e = 0; e < perCell; e++) {
        const pose = emberAt(seed, e, t, cx, cy)
        ctx.globalAlpha = Math.min(1, heat) * (1 - pose.age) * 0.9
        ctx.fillStyle = EMBER_COLOURS[(seed + e) % EMBER_COLOURS.length]
        ctx.fillRect(Math.round(pose.x), Math.round(pose.y), 1.5, 1.5)
      }
    }
  }
  ctx.restore()
}

/** Paints the embers of every burning cell in the view. `fire` is the grid's fire_intensity. */
export function paintEmbers(
  ctx: Ctx,
  fire: ReadonlyArray<ReadonlyArray<number>> | undefined,
  view: EmberView,
  t: number,
): void {
  if (!fire) return
  paintEmberCells(ctx, (row, col) => fire[row]?.[col] ?? 0, view, t, EMBERS_PER_CELL)
}

/** A campfire is a small fire: it throws two embers a cell at a steady heat, not a wildfire's three. */
export const CAMPFIRE_HEAT = 0.6
const CAMPFIRE_EMBERS = 2

/** Paints a few embers over each campfire tile in the view (`tiles` is the grid's tile ids). */
export function paintCampfireSparks(
  ctx: Ctx,
  tiles: ReadonlyArray<ReadonlyArray<number>> | undefined,
  view: EmberView,
  t: number,
): void {
  if (!tiles) return
  paintEmberCells(
    ctx,
    (row, col) => (tiles[row]?.[col] === TILE_ID.CAMPFIRE ? CAMPFIRE_HEAT : 0),
    view,
    t,
    CAMPFIRE_EMBERS,
  )
}
