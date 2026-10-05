import type { SpriteLayer } from 'cubeforge'
import { SPRITE_UNTEXTURED } from 'cubeforge'
import type { WorldState } from '../../../../shared/types'
import { LOW_PERF } from '../../../../shared/perf'
import { packRgba } from './color'

/** A flat tint: colour 0..255, alpha 0..1, drawn source-over (what `fillRect(0, 0, W, H)` did). */
export interface Tint {
  r: number
  g: number
  b: number
  a: number
}

type AtmosphereWorld = Pick<
  WorldState,
  'season' | 'season_progress' | 'day_progress' | 'is_day' | 'hard_winter' | 'weather' | 'drought'
>

/**
 * Every full-world tint `layers/atmosphere.ts` laid over the ground, in its draw order: season,
 * dawn/dusk/night, a hard winter's grey, the weather's gloom and a drought's heat shimmer.
 * `t` is wall-clock ms (only the drought shimmer moves).
 */
export function atmosphereTints(world: AtmosphereWorld, t: number): Tint[] {
  const out: Tint[] = []
  const sp = world.season_progress ?? 0.5
  switch (world.season) {
    case 'decline':
      out.push({ r: 180, g: 110, b: 30, a: 0.05 + sp * 0.06 })
      break
    case 'scarcity':
      out.push({ r: 95, g: 70, b: 40, a: 0.07 + sp * 0.07 })
      break
    case 'recovery':
      out.push({ r: 40, g: 130, b: 150, a: 0.04 + (1 - sp) * 0.05 })
      break
    default:
      break
  }

  const dp = world.day_progress ?? 0.5
  if (!world.is_day) {
    const mid = Math.max(0, 1 - Math.abs(dp - 0.85) * 4)
    out.push({ r: 14, g: 20, b: 58, a: 0.22 + mid * 0.1 })
    out.push({ r: 80, g: 110, b: 200, a: 0.05 + mid * 0.03 })
  } else if (dp < 0.12) {
    const k = (0.12 - dp) / 0.12
    out.push({ r: 255, g: 160, b: 80, a: k * 0.14 })
    out.push({ r: 120, g: 80, b: 160, a: k * 0.06 })
  } else if (dp > 0.55) {
    const k = Math.min(1, (dp - 0.55) / 0.15)
    out.push({ r: 235, g: 120, b: 60, a: k * 0.15 })
    out.push({ r: 150, g: 70, b: 140, a: k * 0.05 })
  }

  if (hardWinter(world)) out.push({ r: 196, g: 214, b: 232, a: 0.09 })

  if (world.weather && world.weather.kind !== 'clear') {
    const wi = Math.max(0, Math.min(1, world.weather.intensity ?? 0))
    if (world.weather.kind === 'storm') out.push({ r: 40, g: 55, b: 90, a: 0.06 + wi * 0.1 })
    else if (world.weather.kind === 'rain') out.push({ r: 70, g: 90, b: 130, a: 0.04 + wi * 0.06 })
    else out.push({ r: 35, g: 45, b: 60, a: 0.07 })
  }

  if (world.drought === true) {
    out.push({ r: 255, g: 180, b: 80, a: (Math.sin(t * 0.001) * 0.5 + 0.5) * 0.04 })
  }
  return out
}

export function hardWinter(world: Pick<WorldState, 'hard_winter' | 'season'>): boolean {
  return !!world.hard_winter && world.season === 'scarcity'
}

/**
 * Fold a stack of source-over tints into the one tint that has the same effect on any pixel:
 * `p' = p * (1 - A) + C * A`. That is exactly what cubeforge's `useScreenTint(..., 'normal')`
 * computes, so the whole atmosphere is a single call per frame.
 */
export function composeTints(layers: readonly Tint[]): Tint | null {
  let pr = 0
  let pg = 0
  let pb = 0
  let pa = 0
  for (const l of layers) {
    if (l.a <= 0) continue
    pr = l.r * l.a + pr * (1 - l.a)
    pg = l.g * l.a + pg * (1 - l.a)
    pb = l.b * l.a + pb * (1 - l.a)
    pa = l.a + pa * (1 - l.a)
  }
  if (pa <= 0) return null
  return { r: pr / pa, g: pg / pa, b: pb / pa, a: pa }
}

// ── precipitation ────────────────────────────────────────────────────────────

/** Whether anything falls from the sky right now. */
export function precipitating(world: Pick<WorldState, 'weather' | 'hard_winter' | 'season'>): boolean {
  if (hardWinter(world)) return true
  const k = world.weather?.kind
  return k === 'rain' || k === 'storm'
}

function addRect(layer: SpriteLayer, x: number, y: number, w: number, h: number, color: number): void {
  const i = layer.add(x + w / 2, y + h / 2, w, h)
  layer.color[i] = color
  layer.flags[i] = SPRITE_UNTEXTURED
}

/**
 * Snow and rain exactly as the canvas painter placed them (positions are a pure function of the
 * particle index and the clock, spread over the whole world), written into `layer`.
 */
export function writePrecipitation(
  layer: SpriteLayer,
  softLine: number,
  world: Pick<WorldState, 'weather' | 'hard_winter' | 'season'>,
  t: number,
  W: number,
  H: number,
): void {
  layer.clear()
  const winter = hardWinter(world)
  if (winter) {
    const wx = world.weather?.wind_x ?? 0.3
    const flakes = LOW_PERF ? 160 : 320
    for (let i = 0; i < flakes; i++) {
      const drift = Math.sin(t * 0.0011 + i * 1.3) * 7 + wx * 14
      const fx = (((i * 137 + t * 0.1 + drift) % W) + W) % W
      const fy = (i * 251 + t * (0.18 + (i % 3) * 0.05)) % H
      const size = 1 + ((i * 7) % 2)
      addRect(layer, fx, fy, size, size, packRgba(245, 249, 255, 0.5 + ((i * 13) % 5) * 0.08))
    }
  }
  const weather = world.weather
  if (weather && (weather.kind === 'rain' || weather.kind === 'storm')) {
    const wi = Math.max(0, Math.min(1, weather.intensity ?? 0))
    const isStorm = weather.kind === 'storm'
    const wx = weather.wind_x ?? 0.4
    const wy = weather.wind_y ?? 0
    if (world.season === 'scarcity' && !isStorm && !winter) {
      const color = packRgba(240, 246, 255, 0.35 + wi * 0.3)
      const flakes = Math.round(90 * (0.4 + wi * 0.6))
      for (let i = 0; i < flakes; i++) {
        const drift = Math.sin(t * 0.0012 + i * 1.7) * 6 + wx * 10
        const sx = (i * 137 + t * 0.12 + drift) % W
        const sy = (i * 251 + t * 0.25) % H
        const sz = 1 + ((i * 7) % 2)
        addRect(layer, sx, sy, sz, sz, color)
      }
    } else if (!(winter && !isStorm)) {
      const color = isStorm
        ? packRgba(180, 195, 230, 0.1 + wi * 0.1)
        : packRgba(170, 190, 225, 0.08 + wi * 0.08)
      const streaks = Math.round((isStorm ? 80 : 50) * (0.4 + wi * 0.6))
      const slantX = wx * (isStorm ? 10 : 6)
      const slantY = (1 + wy * 0.5) * 8
      const len = Math.hypot(slantX, slantY)
      const rot = Math.atan2(slantY, slantX)
      for (let i = 0; i < streaks; i++) {
        const sx = (i * 137 + t * 0.7) % W
        const sy = (i * 251 + t * (isStorm ? 1.4 : 1.0)) % H
        // Anti-aliased like the canvas stroke: a feathered quad twice the line's width.
        const s = layer.add(sx + slantX / 2, sy + slantY / 2, len, 2, softLine)
        layer.rotation[s] = rot
        layer.color[s] = color
      }
    }
  }
  layer.touch()
}
