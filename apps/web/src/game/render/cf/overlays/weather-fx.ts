import type { WorldState } from '../../../../shared/types'
import { TILE } from '../../../model/palette'
import { TILE_ID } from '../../../model/terrain-ids'
import { cellsWhere, forCellsInView, type CellView } from './cell-index'

type Ctx = CanvasRenderingContext2D

/**
 * Weather that is seen rather than read: lightning over storms, rain splashes and puddles, and
 * a rainbow once the rain has passed and the sun is out. Every schedule is a pure function of the
 * clock (or of wall-clock time for the rainbow), so the same moment always looks the same.
 */

/** A storm's strike windows are this long; each window may hold one strike. */
export const STRIKE_SLOT_MS = 3600
/** How long one strike stays on screen. */
const STRIKE_MS = 720
/** Rain splash rings live this long. */
const SPLASH_MS = 420

/** A stable pseudo-random number in [0, 1) from two integers. */
export function unitHash(a: number, b: number): number {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

export interface Strike {
  /** Strike window index, which seeds the bolt's shape. */
  slot: number
  /** Milliseconds since the strike landed. */
  age: number
  /** Where it hits, in the painters' coordinates (grid px, origin removed). */
  x: number
  y: number
}

/** The flash brightness (0..1) of a strike `age` ms after it landed. Flickers, then fades. */
export function strikeEnvelope(age: number): number {
  if (age < 0 || age >= STRIKE_MS) return 0
  if (age < 70) return 1
  if (age < 130) return 0.25
  if (age < 210) return 0.85
  return 0.5 * Math.pow(1 - (age - 210) / (STRIKE_MS - 210), 2)
}

/**
 * The strike visible at wall-clock `t` during a storm of `intensity` (0..1), if any. A window
 * strikes with a probability that grows with the storm; the strike point is drawn inside the
 * camera's view (`cx, cy` centre, `hw, hh` half-extents, all in painter coordinates).
 */
export function strikeAt(
  t: number,
  intensity: number,
  view: { cx: number; cy: number; hw: number; hh: number },
): Strike | null {
  const chance = 0.2 + Math.max(0, Math.min(1, intensity)) * 0.45
  const slot = Math.floor(t / STRIKE_SLOT_MS)
  for (let s = slot - 1; s <= slot; s++) {
    if (unitHash(s, 17) >= chance) continue
    const start = s * STRIKE_SLOT_MS + unitHash(s, 23) * (STRIKE_SLOT_MS - STRIKE_MS)
    const age = t - start
    if (age < 0 || age >= STRIKE_MS) continue
    return {
      slot: s,
      age,
      x: view.cx + (unitHash(s, 31) - 0.5) * 1.6 * view.hw,
      y: view.cy + (unitHash(s, 37) - 0.5) * 1.4 * view.hh,
    }
  }
  return null
}

/**
 * The jagged polyline of a bolt from `top` down to the strike point: midpoint displacement with
 * a seed, so the shape is the same every frame of its life. Returns flat [x0, y0, x1, y1, ...].
 */
export function boltPath(seed: number, x: number, y: number, top: number): number[] {
  // Split each segment at its midpoint and jitter the new point, three times: 8 segments.
  let xs = [x, x]
  let ys = [top, y]
  for (let level = 0; level < 3; level++) {
    const nx: number[] = []
    const ny: number[] = []
    for (let i = 0; i < xs.length - 1; i++) {
      nx.push(xs[i])
      ny.push(ys[i])
      const span = Math.hypot(xs[i + 1] - xs[i], ys[i + 1] - ys[i])
      const j = (unitHash(seed + level * 97, i) - 0.5) * span * 0.45
      nx.push((xs[i] + xs[i + 1]) / 2 + j)
      ny.push((ys[i] + ys[i + 1]) / 2)
    }
    nx.push(xs[xs.length - 1])
    ny.push(ys[ys.length - 1])
    xs = nx
    ys = ny
  }
  const pts: number[] = []
  for (let i = 0; i < xs.length; i++) pts.push(xs[i], ys[i])
  return pts
}

/** How wet the ground looks (0..1): rain fills puddles, and they stay a while after it stops. */
export function wetnessOf(world: WorldState): number {
  const kind = world.weather?.kind
  const intensity = Math.max(0, Math.min(1, world.weather?.intensity ?? 0))
  if (kind === 'storm') return 1
  if (kind === 'rain') return 0.5 + intensity * 0.5
  if (kind === 'wet') return 0.6
  return 0
}

/** A storm's flash on the whole map (0..1), for the tint layer. */
export function lightningFlash(world: WorldState, t: number, view: StrikeView): number {
  if (world.weather?.kind !== 'storm') return 0
  const s = strikeAt(t, world.weather.intensity ?? 0, view)
  return s ? strikeEnvelope(s.age) : 0
}

/** What the strike needs from the camera: centre and half extents in painter coordinates. */
export interface StrikeView {
  cx: number
  cy: number
  hw: number
  hh: number
}

// ── rain on the ground ─────────────────────────────────────────────────────

/** Splash rings across the visible window while it rains (positions and phases are per ring). */
export function paintSplashes(
  ctx: Ctx,
  window: { x0: number; y0: number; x1: number; y1: number },
  t: number,
  intensity: number,
): void {
  const count = Math.round(12 + 52 * Math.max(0, Math.min(1, intensity)))
  const w = window.x1 - window.x0
  const h = window.y1 - window.y0
  if (w <= 0 || h <= 0) return
  ctx.save()
  ctx.fillStyle = '#d9ecff'
  for (let i = 0; i < count; i++) {
    const phase = (t + unitHash(i, 5) * SPLASH_MS) % SPLASH_MS
    const k = phase / SPLASH_MS
    // Positions change each cycle, so the rings do not stay in one place.
    const cycle = Math.floor((t + unitHash(i, 5) * SPLASH_MS) / SPLASH_MS)
    const x = Math.round(window.x0 + unitHash(i * 3 + 1, cycle) * w)
    const y = Math.round(window.y0 + unitHash(i * 3 + 2, cycle) * h)
    ctx.globalAlpha = (1 - k) * 0.5
    pixelRing(ctx, x, y, 1 + Math.round(k * 3))
  }
  ctx.restore()
}

/**
 * A ripple seen from above in whole pixels: a flat oval outline `r` pixels to each side and half that up and down,
 * its corners left open. Four rects that never overlap, so a translucent ring has one even tone; an anti-aliased
 * arc at a fractional position was one of the soft, generated-looking marks (#883).
 */
export function pixelRing(ctx: Pick<Ctx, 'fillRect'>, x: number, y: number, r: number): void {
  const ry = Math.max(1, Math.round(r / 2))
  ctx.fillRect(x - r, y, 1, 1)
  ctx.fillRect(x + r, y, 1, 1)
  if (r < 2) return
  ctx.fillRect(x - r + 1, y - ry, 2 * r - 1, 1)
  ctx.fillRect(x - r + 1, y + ry, 2 * r - 1, 1)
}

/**
 * A puddle in whole pixels: a two-pixel band `2 rx` wide with a one-pixel band above and below, each a pixel
 * shorter at both ends. Non-overlapping rects, so the translucent water is one flat tone.
 */
export function pixelPuddle(ctx: Pick<Ctx, 'fillRect'>, x: number, y: number, rx: number): void {
  ctx.fillRect(x - rx, y - 1, 2 * rx, 2)
  ctx.fillRect(x - rx + 1, y - 2, 2 * rx - 2, 1)
  ctx.fillRect(x - rx + 1, y + 1, 2 * rx - 2, 1)
}

/** Widest puddle half-width that fits a tile: 2 rx pixels across, inside TILE. */
const PUDDLE_MAX_RX = Math.floor(TILE / 2) - 1

/** Ground a puddle can lie on: not water, rock, snow, ice, lava, fire or a building. */
const PUDDLE_GROUND: ReadonlySet<number> = new Set([
  TILE_ID.GRASS,
  TILE_ID.FOOD,
  TILE_ID.ASH,
  TILE_ID.SCORCHED,
  TILE_ID.SAND,
])

/**
 * Puddles on open ground in the view, more of them the wetter the weather is. Only on ground that can hold one:
 * they were laid on every tile, the sea included, which zoomed out read as a speckle over the whole map (#883).
 */
export function paintPuddles(ctx: Ctx, tiles: ArrayLike<number>[], view: CellView, wetness: number): void {
  if (wetness <= 0) return
  const ground = cellsWhere(tiles, 'puddle-ground', (row, col) => PUDDLE_GROUND.has(tiles[row][col] ?? 0))
  ctx.save()
  ctx.fillStyle = 'rgba(170,200,226,0.32)'
  forCellsInView(ground, view, (row, col) => {
    const c = col + view.ox
    const r = row + view.oy
    if (unitHash(c * 7 + 3, r * 13 + 1) > wetness * 0.16) return
    // The whole puddle stays inside its own tile, so none spills onto the water or rock next to it: `2 rx` wide
    // and four pixels tall (rows y - 2 to y + 1), placed by the hash within what the tile leaves.
    const rx = Math.min(PUDDLE_MAX_RX, 2 + Math.round(unitHash(c + 1, r + 2)))
    const x = col * TILE + rx + Math.round(unitHash(c, r + 9) * (TILE - 2 * rx))
    const y = row * TILE + 2 + Math.round(unitHash(r, c + 4) * (TILE - 4))
    pixelPuddle(ctx, x, y, rx)
  })
  ctx.restore()
}

/** The bolt of a strike: a wide faint glow under a bright core, from the top of the view. */
export function paintBolt(ctx: Ctx, strike: Strike, top: number): void {
  const pts = boltPath(strike.slot, strike.x, strike.y, top)
  const alpha = strikeEnvelope(strike.age)
  if (alpha <= 0) return
  ctx.save()
  ctx.lineJoin = 'miter'
  ctx.lineCap = 'butt'
  ctx.globalAlpha = 0.28 * alpha
  ctx.strokeStyle = '#cfe4ff'
  ctx.lineWidth = TILE * 0.8
  strokePolyline(ctx, pts)
  ctx.globalAlpha = 0.95 * alpha
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 2
  strokePolyline(ctx, pts)
  ctx.restore()
}

function strokePolyline(ctx: Ctx, pts: number[]): void {
  ctx.beginPath()
  ctx.moveTo(pts[0], pts[1])
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1])
  ctx.stroke()
}
