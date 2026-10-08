import type { WorldState } from '../../../../shared/types'
import { TILE } from '../../../model/palette'
import type { CfFrame } from './frame'

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
export function wetnessOf(world: WorldState, t: number): number {
  void t
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

// ── rainbows ───────────────────────────────────────────────────────────────

/** Wall-clock timings of a rainbow, from the moment the rain stops. */
const RAINBOW_RAMP_MS = 3000
const RAINBOW_HOLD_MS = 30000
const RAINBOW_FADE_MS = 15000

export interface WeatherFxState {
  /** Last weather kind seen, so the moment rain stops can be caught. */
  lastKind: string
  /** Wall-clock ms when the last rain stopped, or -Infinity. */
  rainStoppedAt: number
}

export function newWeatherFxState(): WeatherFxState {
  return { lastKind: 'clear', rainStoppedAt: -Infinity }
}

const isRain = (kind: string) => kind === 'rain' || kind === 'storm'

/** Note the weather of this frame; call once per frame, in order. */
export function observeWeather(state: WeatherFxState, kind: string, t: number): void {
  if (isRain(state.lastKind) && !isRain(kind)) state.rainStoppedAt = t
  state.lastKind = kind
}

/** How strong the rainbow is now (0..1): it needs dry sky and a sun that is up. */
export function rainbowStrength(state: WeatherFxState, t: number, isDay: boolean): number {
  if (!isDay || isRain(state.lastKind)) return 0
  const since = t - state.rainStoppedAt
  if (!(since >= 0)) return 0
  if (since < RAINBOW_RAMP_MS) return since / RAINBOW_RAMP_MS
  if (since < RAINBOW_RAMP_MS + RAINBOW_HOLD_MS) return 1
  const fade = (since - RAINBOW_RAMP_MS - RAINBOW_HOLD_MS) / RAINBOW_FADE_MS
  return fade >= 1 ? 0 : 1 - fade
}

const RAINBOW_COLORS = ['#e0453a', '#ef8a2e', '#f2d23d', '#5cc056', '#3aa2d9', '#4a5fd0', '#9a52c4']

/**
 * A pixel rainbow: seven bands of square dots along a half circle centred on the camera. Each dot
 * is a fillRect so the recorder can batch it; the band count and step are fixed to keep the sprite
 * count the same whatever the zoom.
 */
export function paintRainbow(ctx: Ctx, view: StrikeView, strength: number): void {
  if (strength <= 0) return
  const radius = Math.min(view.hw, view.hh * 1.6) * 0.62
  const band = Math.max(TILE * 0.5, radius * 0.05)
  const steps = 72
  ctx.save()
  ctx.globalAlpha = 0.5 * strength
  for (let b = 0; b < RAINBOW_COLORS.length; b++) {
    ctx.fillStyle = RAINBOW_COLORS[b]
    const r = radius - b * band * 0.95
    for (let i = 0; i <= steps; i++) {
      const a = Math.PI + (i / steps) * Math.PI
      const x = view.cx + Math.cos(a) * r
      const y = view.cy + Math.sin(a) * r
      ctx.fillRect(x - band / 2, y - band / 2, band, band)
    }
  }
  ctx.restore()
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
  ctx.lineWidth = 0.9
  ctx.strokeStyle = '#d9ecff'
  for (let i = 0; i < count; i++) {
    const phase = (t + unitHash(i, 5) * SPLASH_MS) % SPLASH_MS
    const k = phase / SPLASH_MS
    // Positions change each cycle, so the rings do not stay in one place.
    const cycle = Math.floor((t + unitHash(i, 5) * SPLASH_MS) / SPLASH_MS)
    const x = window.x0 + unitHash(i * 3 + 1, cycle) * w
    const y = window.y0 + unitHash(i * 3 + 2, cycle) * h
    ctx.globalAlpha = (1 - k) * 0.5
    ctx.beginPath()
    ctx.arc(x, y, 1 + k * 3.2, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.restore()
}

/** Puddles on the ground in the visible window, more of them the wetter the weather is. */
export function paintPuddles(ctx: Ctx, f: Pick<CfFrame, 'bounds' | 'ox' | 'oy'>, wetness: number): void {
  if (wetness <= 0) return
  const { c0, c1, r0, r1 } = f.bounds
  ctx.save()
  ctx.fillStyle = 'rgba(170,200,226,0.32)'
  for (let r = r0; r < r1; r++) {
    for (let c = c0; c < c1; c++) {
      const pick = unitHash(c * 7 + 3, r * 13 + 1)
      if (pick > wetness * 0.16) continue
      const x = (c - f.ox) * TILE + TILE * (0.2 + unitHash(c, r + 9) * 0.6)
      const y = (r - f.oy) * TILE + TILE * (0.2 + unitHash(r, c + 4) * 0.6)
      const rx = 2 + unitHash(c + 1, r + 2) * 3
      ctx.beginPath()
      ctx.ellipse(x, y, rx, rx * 0.5, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  }
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
