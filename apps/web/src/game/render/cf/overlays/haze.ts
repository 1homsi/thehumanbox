import type { WorldState } from '../../../../shared/types'
import { TILE } from '../../../model/palette'
import { painterView, type CfFrame } from './frame'
import { unitHash } from './weather-fx'

type Ctx = CanvasRenderingContext2D

/**
 * Low haze over the land: mist banks at dawn, after rain and a little at night, and dust wisps
 * when the land is in drought. Banks are soft radial blobs that drift with the wind; their
 * positions are a pure function of the bank index and the clock, spread over the whole world.
 */

export interface HazeLevels {
  /** Mist, 0..1. */
  fog: number
  /** Dust, 0..1. */
  dust: number
}

/** The mist and dust levels for this world at wall-clock `t`. */
export function hazeLevels(world: WorldState): HazeLevels {
  const dp = world.day_progress ?? 0.5
  let fog = 0
  if (world.is_day) {
    // Dawn mist burns off by mid-morning; a little lingers at dusk.
    if (dp < 0.22) fog = (0.22 - dp) / 0.22
    else if (dp > 0.8) fog = ((dp - 0.8) / 0.2) * 0.35
  } else {
    fog = 0.35
  }
  const kind = world.weather?.kind
  if (kind === 'wet') fog = Math.max(fog, 0.5)
  else if (kind === 'rain' || kind === 'storm') fog = Math.max(fog, 0.25)
  return { fog: Math.min(1, fog), dust: world.drought === true ? 0.8 : 0 }
}

const MIST = '236,242,246'
const DUST = '205,172,116'
/** Most banks (and wisps) the world is covered with: a grid this fine at most. */
const MAX_CELLS = 140

/**
 * Paints the mist banks and dust wisps over the world (in the ground layer, so they sit above the
 * trees and under the buildings and people). Banks sit on a grid spread over the whole world, a
 * random half of the cells filled, so the camera always sees some whatever its place. Each blob
 * is one radial gradient fill.
 */
export function paintHaze(ctx: Ctx, f: CfFrame, levels: HazeLevels, t: number): void {
  if (levels.fog <= 0 && levels.dust <= 0) return
  const W = f.W
  const H = f.H
  const wind = f.world.weather?.wind_x ?? 0.3
  const cell = Math.max(TILE * 20, Math.sqrt((W * H) / MAX_CELLS))
  const cols = Math.max(1, Math.ceil(W / cell))
  const rows = Math.max(1, Math.ceil(H / cell))
  // Only the banks the camera can see are painted: a blob is one gradient fill, and the world holds
  // about seventy of them.
  const view = painterView(f, TILE * 2)
  ctx.save()
  if (levels.fog > 0) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c
        if (unitHash(i, 19) > 0.55) continue
        const speed = (0.004 + unitHash(i, 61) * 0.006) * (1 + wind)
        const x = wrap((c + unitHash(i, 11)) * cell + t * speed, W)
        const y = (r + unitHash(i, 23)) * cell
        const rx = cell * (0.7 + unitHash(i, 37) * 0.5)
        if (!inView(view, x, y, rx, rx * 0.4)) continue
        const a = levels.fog * (0.2 + unitHash(i, 41) * 0.14)
        paintBlob(ctx, x, y, rx, rx * 0.4, `rgba(${MIST},${a.toFixed(3)})`, `rgba(${MIST},0)`)
      }
    }
  }
  if (levels.dust > 0) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c
        if (unitHash(i, 71) > 0.35) continue
        const speed = (0.012 + unitHash(i, 67) * 0.01) * (1 + wind)
        const x = wrap((c + unitHash(i, 13)) * cell + t * speed, W)
        const y = (r + unitHash(i, 29)) * cell
        const rx = cell * (0.4 + unitHash(i, 43) * 0.4)
        if (!inView(view, x, y, rx, rx * 0.3)) continue
        const a = levels.dust * (0.14 + unitHash(i, 53) * 0.14)
        paintBlob(ctx, x, y, rx, rx * 0.3, `rgba(${DUST},${a.toFixed(3)})`, `rgba(${DUST},0)`)
      }
    }
  }
  ctx.restore()
}

/** Whether a blob centred at (x, y) with radii (rx, ry) can reach the view. */
function inView(
  v: { x0: number; y0: number; x1: number; y1: number },
  x: number,
  y: number,
  rx: number,
  ry: number,
): boolean {
  return x + rx >= v.x0 && x - rx <= v.x1 && y + ry >= v.y0 && y - ry <= v.y1
}

function wrap(x: number, size: number): number {
  return ((x % size) + size) % size
}

function paintBlob(
  ctx: Ctx,
  x: number,
  y: number,
  rx: number,
  ry: number,
  inner: string,
  outer: string,
): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, rx)
  g.addColorStop(0, inner)
  g.addColorStop(1, outer)
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
  ctx.fill()
}
