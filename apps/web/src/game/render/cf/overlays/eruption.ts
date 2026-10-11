import { TILE } from '../../../model/palette'
import { BIOME_ID, TILE_ID } from '../../../model/terrain-ids'
import { unitHash } from './weather-fx'

type Ctx = CanvasRenderingContext2D

/**
 * Volcanic vents: on volcanic ground a few cells are open vents, and the molten mouth of a crater
 * (a lava cell ringed by lava, as a volcano raised by the god tool opens it) always is. Each one glows at its mouth and
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

/**
 * Whether grid cell (row, col) is a crater's mouth: molten lava on volcanic ground with lava on all
 * four sides. A volcano's crater is a block of lava, so its middle is a mouth while the crater is
 * molten; a thin flow running downhill is not, and once the crater cools to rock the plume stops.
 */
export function isCraterMouth(
  tiles: ReadonlyArray<ReadonlyArray<number>>,
  biomes: ReadonlyArray<ReadonlyArray<number>>,
  row: number,
  col: number,
): boolean {
  if (tiles[row]?.[col] !== TILE_ID.LAVA || biomes[row]?.[col] !== BIOME_ID.VOLCANIC) return false
  return (
    tiles[row - 1]?.[col] === TILE_ID.LAVA &&
    tiles[row + 1]?.[col] === TILE_ID.LAVA &&
    tiles[row]?.[col - 1] === TILE_ID.LAVA &&
    tiles[row]?.[col + 1] === TILE_ID.LAVA
  )
}

/** The vents in the view, as grid cells, at most `VENT_LIMIT` of them; crater mouths come first. */
export function findVents(
  tiles: ReadonlyArray<ReadonlyArray<number>> | undefined,
  biomes: ReadonlyArray<ReadonlyArray<number>> | undefined,
  view: VentView,
): { row: number; col: number }[] {
  const mouths: { row: number; col: number }[] = []
  const vents: { row: number; col: number }[] = []
  if (!tiles || !biomes) return mouths
  for (let r = view.r0; r < view.r1 && mouths.length < VENT_LIMIT; r++) {
    const row = r - view.oy
    const tr = tiles[row]
    const br = biomes[row]
    if (!tr || !br) continue
    for (let c = view.c0; c < view.c1 && mouths.length < VENT_LIMIT; c++) {
      const col = c - view.ox
      if (isCraterMouth(tiles, biomes, row, col)) mouths.push({ row, col })
      else if (vents.length < VENT_LIMIT && isVent(tr[col] ?? 0, br[col] ?? 0, row, col))
        vents.push({ row, col })
    }
  }
  return [...mouths, ...vents].slice(0, VENT_LIMIT)
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

/** A volcano's cone as the sim sends it: crater x, y and radius, in tiles. */
export type VolcanoCone = readonly [number, number, number]

const CONE_LIT = '#6f625a'
const CONE_SHADE = '#463b35'
const CONE_ASH = '#8d847c'
const CONE_EDGE = '#251e1a'
const CRATER = '#2e2522'
const LAVA_HOT = '#ffb84a'
const LAVA = '#e2572c'

/** Where a cone stands in ground-layer pixels: its crater mouth on top, and its base. */
export function coneGeometry(v: VolcanoCone, view: VentView) {
  const [x, y, r] = v
  const mx = Math.round((x - view.ox) * TILE + TILE / 2)
  const crater = (y - view.oy) * TILE + TILE / 2
  return {
    mx,
    peakY: Math.round(crater - r * 0.55 * TILE),
    baseY: Math.round(crater + r * 0.45 * TILE),
    topHalf: Math.max(TILE, Math.round(r * 0.2 * TILE)),
    baseHalf: Math.round(r * 0.85 * TILE),
    row: y - view.oy,
    col: x - view.ox,
  }
}

/** Whether a volcano is erupting: its crater still holds lava (or the fire world generation lit in it). */
export function coneErupting(
  v: VolcanoCone,
  tiles: ReadonlyArray<ReadonlyArray<number>> | undefined,
  view: VentView,
) {
  const tid = tiles?.[v[1] - view.oy]?.[v[0] - view.ox]
  return tid === TILE_ID.LAVA || tid === TILE_ID.FIRE
}

/** The cones in the view (with their own size as margin). */
export function conesInView(
  volcanoes: ReadonlyArray<VolcanoCone> | undefined,
  view: VentView,
): VolcanoCone[] {
  return (volcanoes ?? []).filter(
    ([x, y, r]) => x + r >= view.c0 && x - r < view.c1 && y + r >= view.r0 && y - r < view.r1,
  )
}

/**
 * One volcano's cone, standing over its crater: rock lit from the west and shaded on the east, a
 * crater on top, and while it erupts, lava in the crater running down its flanks.
 */
export function paintCone(ctx: Ctx, v: VolcanoCone, view: VentView, erupting: boolean): void {
  const { mx, peakY, baseY, topHalf, baseHalf } = coneGeometry(v, view)
  const height = Math.max(1, baseY - peakY)
  const [vx, vy] = v
  for (let y = peakY; y <= baseY; y++) {
    const k = (y - peakY) / height
    // Steep near the crater, flaring out into the plain: a volcano, not a pyramid. The flanks are
    // a pixel rough, the same pixels every pass.
    const rough = Math.round((unitHash(vx * 7 + y, vy) - 0.5) * 2)
    const half = Math.round(topHalf + (baseHalf - topHalf) * Math.pow(k, 1.7)) + (k > 0.15 ? rough : 0)
    const split = Math.round(mx + half * 0.15)
    ctx.fillStyle = CONE_EDGE
    ctx.fillRect(mx - half - 1, y, half * 2 + 2, 1)
    ctx.fillStyle = CONE_LIT
    ctx.fillRect(mx - half, y, split - (mx - half), 1)
    ctx.fillStyle = CONE_SHADE
    ctx.fillRect(split, y, mx + half - split, 1)
    // Ash lies pale on the upper slopes.
    if (k < 0.3) {
      ctx.fillStyle = CONE_ASH
      ctx.fillRect(mx - half, y, Math.max(1, Math.round((split - (mx - half)) * 0.6)), 1)
    }
  }
  ctx.fillStyle = CONE_EDGE
  ctx.fillRect(mx - topHalf - 1, peakY - 1, topHalf * 2 + 2, 1)
  ctx.fillStyle = CRATER
  ctx.fillRect(mx - topHalf + 1, peakY, topHalf * 2 - 2, 2)
  if (!erupting) return
  ctx.fillStyle = LAVA
  ctx.fillRect(mx - topHalf + 2, peakY, topHalf * 2 - 4, 2)
  ctx.fillStyle = LAVA_HOT
  ctx.fillRect(mx - 2, peakY, 4, 1)
  // Lava runs down the flanks from the rim, each stream a little way, wandering as it goes.
  const [x, y] = [vx, vy]
  for (let s = 0; s < 3; s++) {
    let sx = mx + Math.round((s - 1) * topHalf * 0.7)
    const len = Math.round(height * (0.35 + unitHash(x + s * 31, y + 3) * 0.4))
    ctx.fillStyle = LAVA
    for (let d = 0; d < len; d++) {
      if (d % 3 === 2) sx += unitHash(x + s, y + d) < 0.5 ? -1 : 1
      ctx.fillRect(sx, peakY + 2 + d, d < len * 0.3 ? 2 : 1, 1)
    }
  }
}

/**
 * Paints the volcanoes' cones, then the glowing mouths, smoke columns and falling ash of every vent in
 * the view. An erupting volcano's plume rises from the crater on top of its cone.
 */
export function paintEruption(
  ctx: Ctx,
  tiles: ReadonlyArray<ReadonlyArray<number>> | undefined,
  biomes: ReadonlyArray<ReadonlyArray<number>> | undefined,
  view: VentView,
  t: number,
  night: boolean,
  volcanoes?: ReadonlyArray<VolcanoCone>,
): void {
  const cones = conesInView(volcanoes, view)
  const peaks = new Map<string, number>()
  const vents = findVents(tiles, biomes, view)
  for (const v of cones) {
    const erupting = coneErupting(v, tiles, view)
    paintCone(ctx, v, view, erupting)
    if (!erupting) continue
    const g = coneGeometry(v, view)
    // The crater mouth (when molten) is already a vent: its plume moves up to the peak.
    const key = `${g.row},${g.col}`
    peaks.set(key, g.peakY)
    if (!vents.some((w) => w.row === g.row && w.col === g.col)) vents.unshift({ row: g.row, col: g.col })
  }
  if (vents.length === 0) return
  ctx.save()
  const boost = night ? 1.6 : 1
  for (const { row, col } of vents) {
    const seed = unitHash(col, row) * 10
    const mx = col * TILE + TILE / 2
    const my = peaks.get(`${row},${col}`) ?? row * TILE + TILE * 0.3
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
