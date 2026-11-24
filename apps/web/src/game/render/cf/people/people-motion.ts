import type { AgeStage } from '../../character-visuals'

export const GLIDE_MS = 70
export const GLIDE_SNAP_MS = 250
export const JUMP_TILES = 4
export const SETTLE_TILES = 0.004
export const TURN_AFTER_TILES = 0.2
export const AIM_MIN_TILES = 0.6
export const GLANCE_MS = 700
export const GLANCE_AFTER_MS = 1500
export const SCATTER_X = 3
export const SCATTER_Y = 2

export const PEP_CALM = 0
export const PEP_STEADY = 1
export const PEP_LIVELY = 2

const BREATH_MS = [4200, 3000, 1500] as const
const BREATH_DOWN = [0.55, 0.35, 0.4] as const
const GLANCE_EVERY_MS = [11000, 7000, 3200] as const
const STRIDE = { infant: 7, child: 6, teen: 4.5, adult: 4, elder: 5.5 } as const
const WEARY_STRIDE = 5

export function glideFactor(dt: number): number {
  if (!(dt > 0) || dt > GLIDE_SNAP_MS) return 1
  return 1 - Math.exp(-dt / GLIDE_MS)
}

export function paceOf(phase: number): number {
  return 0.8 + (phase % 97) / 240
}

export function personGlide(k: number, phase: number): number {
  return k >= 1 ? 1 : k * paceOf(phase)
}

export function glideToward(from: number, to: number, k: number): number {
  const d = to - from
  const far = d < 0 ? -d : d
  return k >= 1 || far > JUMP_TILES || far < SETTLE_TILES ? to : from + d * k
}

export function scatterX(phase: number): number {
  return (phase % (2 * SCATTER_X + 1)) - SCATTER_X
}

export function scatterY(phase: number): number {
  return (Math.floor(phase / 7) % (2 * SCATTER_Y + 1)) - SCATTER_Y
}

export function pepOf(stage: AgeStage, energy: number, health: number): number {
  if (energy < 0.2 || health < 0.3) return PEP_CALM
  if (stage === 'infant' || stage === 'child') return PEP_LIVELY
  return stage === 'elder' ? PEP_CALM : PEP_STEADY
}

export function strideOf(stage: AgeStage, pep: number): number {
  const stride = STRIDE[stage]
  return pep === PEP_CALM && stride < WEARY_STRIDE ? WEARY_STRIDE : stride
}

export function walkFrame(distance: number, stride: number, phase: number, frames: number): number {
  return Math.floor(distance * stride + phase / 200) % frames
}

export const BREATH_SHIFT = 41
export const GLANCE_SHIFT = 53

export function breathPeriod(phase: number, pep: number): number {
  return BREATH_MS[pep] + (phase % 11) * 90
}

export function breathDownMs(phase: number, pep: number): number {
  return Math.round(breathPeriod(phase, pep) * BREATH_DOWN[pep])
}

export function glancePeriod(phase: number, pep: number): number {
  return GLANCE_EVERY_MS[pep] + (phase % 7) * 610
}

export function idleClock(now: number, epoch: number): number {
  return (now - epoch) & 0x3fffffff
}

export function breathDown(clock: number, phase: number, pep: number): boolean {
  return (clock + phase * BREATH_SHIFT) % breathPeriod(phase, pep) < breathDownMs(phase, pep)
}

export function glancing(clock: number, phase: number, pep: number): boolean {
  return (clock + phase * GLANCE_SHIFT) % glancePeriod(phase, pep) < GLANCE_MS
}

export function aimOf(x: number, targetX: number | null | undefined): number {
  if (targetX == null) return 0
  const d = targetX - x
  return d > AIM_MIN_TILES ? 1 : d < -AIM_MIN_TILES ? -1 : 0
}

export class GaitStore {
  capacity = 0
  x = new Float64Array(0)
  y = new Float64Array(0)
  turn = new Float32Array(0)
  flipped = new Uint8Array(0)

  reserve(n: number): void {
    if (n <= this.capacity) return
    const cap = Math.max(n, this.capacity * 2, 64)
    const x = new Float64Array(cap)
    const y = new Float64Array(cap)
    const turn = new Float32Array(cap)
    const flipped = new Uint8Array(cap)
    x.set(this.x)
    y.set(this.y)
    turn.set(this.turn)
    flipped.set(this.flipped)
    this.x = x
    this.y = y
    this.turn = turn
    this.flipped = flipped
    this.capacity = cap
  }

  init(i: number, x: number, y: number): void {
    this.x[i] = x
    this.y[i] = y
    this.turn[i] = 0
    this.flipped[i] = 0
  }

  copyFrom(from: GaitStore, fromIndex: number, i: number): void {
    this.x[i] = from.x[fromIndex]
    this.y[i] = from.y[fromIndex]
    this.turn[i] = from.turn[fromIndex]
    this.flipped[i] = from.flipped[fromIndex]
  }

  glide(i: number, tx: number, ty: number, k: number): number {
    const before = this.x[i]
    const x = glideToward(before, tx, k)
    this.x[i] = x
    this.y[i] = glideToward(this.y[i], ty, k)
    const dx = x - before
    return dx > JUMP_TILES || dx < -JUMP_TILES ? 0 : dx
  }

  face(i: number, dx: number): void {
    if (dx === 0) return
    const against = this.flipped[i] === 1 ? dx > 0 : dx < 0
    if (!against) {
      this.turn[i] = 0
      return
    }
    const turned = this.turn[i] + (dx < 0 ? -dx : dx)
    if (turned >= TURN_AFTER_TILES) {
      this.flipped[i] = dx < 0 ? 1 : 0
      this.turn[i] = 0
    } else this.turn[i] = turned
  }
}
