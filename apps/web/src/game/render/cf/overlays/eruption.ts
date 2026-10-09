import { TILE } from '../../../model/palette'
import { BIOME_ID, TILE_ID } from '../../../model/terrain-ids'
import { unitHash } from './weather-fx'

type Ctx = CanvasRenderingContext2D

/**
 * Volcanic vents: on volcanic ground a few cells are open vents. Each one glows at its mouth and
 * sends up a column of dark smoke that rises, spreads and thins out, while ash drifts down from the
 * top of the column over the land round it. The smoke and ash are pure functions of the clock and
 * the vent's place, so the same moment always shows the same plume. Painted with the throttled
 * ground layer.
 */

/** One cell in this many volcanic cells is a vent. */
export const VENT_ODDS = 1 / 23
/** Most vents drawn in one pass; the rest are left out. */
export const VENT_LIMIT = 24
/** Smoke puffs per vent, spread over one rising cycle. */
export const PUFFS = 4
/** Ash specks per vent. */
const ASH_SPECKS = 3
/** How far a smoke column climbs, in tiles. */
const PLUME_HEIGHT = 7
/** Smoke cycle: one full rise every ~5.5 s. */
const PUFF_RATE = 0.00018
/** Ash cycle: one fall every ~3 s. */
const ASH_RATE = 0.00033
const SMOKE_RGB = '64,60,58'
const ASH_COLOUR = 'rgb(92,86,80)'
const GLOW_RGB = '255,120,40'

export interface VentView {
  /** Visible window in sim tiles (inclusive-exclusive), like `f.bounds`. */
  c0: number
  c1: number
  r0: number
  r1: number
  /** Sim coordinates of grid cell (0, 0). */
  ox: number
  oy: number
}

/** Whether grid cell (row, col) is a vent: volcanic ground, on a sparse hash. */
export function isVent(tid: number, biome: number, row: number, col: number): boolean {
  if (biome !== BIOME_ID.VOLCANIC) return false
  if (tid === TILE_ID.WATER || tid === TILE_ID.FLOODED || tid === TILE_ID.SNOW) return false
  return unitHash(col * 5 + 1, row * 9 + 4) < VENT_ODDS
}

/** The vents in the view, as grid cells, at most `VENT_LIMIT` of them. */
export function findVents(
  tiles: ReadonlyArray<ReadonlyArray<number>> | undefined,
  biomes: ReadonlyArray<ReadonlyArray<number>> | undefined,
  view: VentView,
): { row: number; col: number }[] {
  const out: { row: number; col: number }[] = []
  if (!tiles || !biomes) return out
  for (let r = view.r0; r < view.r1 && out.length < VENT_LIMIT; r++) {
    const row = r - view.oy
    const tr = tiles[row]
    const br = biomes[row]
    if (!tr || !br) continue
    for (let c = view.c0; c < view.c1 && out.length < VENT_LIMIT; c++) {
      const col = c - view.ox
      if (isVent(tr[col] ?? 0, br[col] ?? 0, row, col)) out.push({ row, col })
    }
  }
  return out
}

/** One smoke puff of a vent at clock `t`: centre and radius in pixels, and its alpha. */
export interface Puff {
  x: number
  y: number
  r: number
  a: number
}

/**
 * Smoke puff `k` of the vent whose mouth is at (mx, my) pixels, at clock `t` (ms). A puff rises
 * from the mouth, drifts east with the wind, spreads and thins out as it goes.
 */
export function plumePuff(mx: number, my: number, seed: number, k: number, t: number): Puff {
  const p = (t * PUFF_RATE + seed * 0.37 + k / PUFFS) % 1
  const sway = Math.sin(seed * 2.3 + k * 1.7) * TILE * 0.4
  const fade = Math.min(1, p / 0.12)
  return {
    x: mx + sway + p * TILE * 1.6,
    y: my - p * PLUME_HEIGHT * TILE,
    r: TILE * (0.7 + p * 2.2),
    a: 0.5 * (1 - p) * fade,
  }
}

/** Paints the glowing mouths, smoke columns and falling ash of every vent in the view. */
export function paintEruption(
  ctx: Ctx,
  tiles: ReadonlyArray<ReadonlyArray<number>> | undefined,
  biomes: ReadonlyArray<ReadonlyArray<number>> | undefined,
  view: VentView,
  t: number,
  night: boolean,
): void {
  const vents = findVents(tiles, biomes, view)
  if (vents.length === 0) return
  ctx.save()
  const boost = night ? 1.6 : 1
  for (const { row, col } of vents) {
    const seed = unitHash(col, row) * 10
    const mx = col * TILE + TILE / 2
    const my = row * TILE + TILE * 0.3
    // The mouth: a warm pool of light that breathes slowly.
    const breathe = 0.5 + 0.5 * Math.sin(t * 0.0028 + seed)
    const glow = ctx.createRadialGradient(mx, my, 0, mx, my, TILE * 1.8)
    glow.addColorStop(0, `rgba(${GLOW_RGB},${(0.42 * breathe * boost).toFixed(3)})`)
    glow.addColorStop(1, `rgba(${GLOW_RGB},0)`)
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(mx, my, TILE * 1.8, 0, Math.PI * 2)
    ctx.fill()
    // The column: puffs from the oldest (highest, faintest) to the newest.
    for (let k = 0; k < PUFFS; k++) {
      const puff = plumePuff(mx, my, seed, k, t)
      if (puff.a <= 0.01) continue
      ctx.fillStyle = `rgba(${SMOKE_RGB},${puff.a.toFixed(3)})`
      ctx.beginPath()
      ctx.arc(puff.x, puff.y, puff.r, 0, Math.PI * 2)
      ctx.fill()
    }
    // Ash: specks that fall from the top of the column over the ground round it.
    ctx.fillStyle = ASH_COLOUR
    for (let k = 0; k < ASH_SPECKS; k++) {
      const p = (t * ASH_RATE + seed * 0.21 + k / ASH_SPECKS) % 1
      const spread = (unitHash(col + k * 13, row + 7) - 0.5) * TILE * 4
      const x = mx + spread + p * TILE * 1.2
      const y = my - PLUME_HEIGHT * TILE * 0.8 + p * TILE * 9
      ctx.globalAlpha = 0.7 * (1 - p)
      ctx.fillRect(x, y, 1.5, 1.5)
    }
    ctx.globalAlpha = 1
  }
  ctx.restore()
}
