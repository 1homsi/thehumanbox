import type { OrganismState, AnimalState } from '../../../types'

interface OrgPrediction {
  serverX: number
  serverY: number
  serverTime: number

  velX: number
  velY: number
  velDt: number

  errorX: number
  errorY: number

  heading: number
  lastPredX: number
  lastPredY: number
  lastReadTime: number

  targetX: number | undefined
  targetY: number | undefined
}

type AnimalPrediction = OrgPrediction

const orgState = new Map<string, OrgPrediction>()
const animalState = new Map<number, AnimalPrediction>()

const TICK_MS = 100

const ERROR_DECAY_PER_S = 12

const VEL_EMA_ALPHA = 0.45

const HEADING_TURN_RATE = Math.PI

const MAX_EXTRAP_MS = 150

// Approximate tile steps per second (1 tile/tick × 10 ticks/s)
const TILES_PER_SECOND = 10

export function updateOrgMotion(organisms: OrganismState[]) {
  const now = performance.now()
  for (const o of organisms) {
    if (!o.alive) continue
    const entry = orgState.get(o.id)
    if (entry) {
      ingestSnapshot(entry, o.x, o.y, now, o.vx, o.vy, o.target_x, o.target_y)
    } else {
      orgState.set(o.id, fresh(o.x, o.y, now))
    }
  }
}

export function getOrgXY(id: string): [number, number] {
  const e = orgState.get(id)
  if (!e) return [0, 0]
  return advanceAndRead(e)
}

export function getOrgVelocityXY(id: string): [number, number] {
  const e = orgState.get(id)
  if (!e) return [0, 0]
  return [e.velX * TICK_MS * 0.001, e.velY * TICK_MS * 0.001]
}

export function getOrgHeading(id: string): number {
  const e = orgState.get(id)
  if (!e) return 0
  return e.heading
}

export function updateAnimalMotion(animals: AnimalState[]) {
  const now = performance.now()
  for (const a of animals) {
    const entry = animalState.get(a.id)
    if (entry) {
      ingestSnapshot(entry, a.x, a.y, now)
    } else {
      animalState.set(a.id, fresh(a.x, a.y, now))
    }
  }
}

export function getAnimalXY(id: number): [number, number] {
  const e = animalState.get(id)
  if (!e) return [0, 0]
  return advanceAndRead(e)
}

export function getAnimalHeading(id: number): number {
  const e = animalState.get(id)
  if (!e) return 0
  return e.heading
}

function fresh(x: number, y: number, now: number): OrgPrediction {
  return {
    serverX: x,
    serverY: y,
    serverTime: now,
    velX: 0,
    velY: 0,
    velDt: TICK_MS,
    errorX: 0,
    errorY: 0,
    heading: 0,
    lastPredX: x,
    lastPredY: y,
    lastReadTime: now,
    targetX: undefined,
    targetY: undefined,
  }
}

function ingestSnapshot(
  e: OrgPrediction,
  x: number,
  y: number,
  now: number,
  vx?: number,
  vy?: number,
  targetX?: number,
  targetY?: number,
) {
  if (e.serverX === x && e.serverY === y && now - e.serverTime < TICK_MS * 0.5) {
    // still update target even if position hasn't changed
    e.targetX = targetX
    e.targetY = targetY
    return
  }

  const dt = Math.max(1, now - e.serverTime)
  const dtSec = dt * 0.001

  if (vx !== undefined && vy !== undefined) {
    e.velX = vx
    e.velY = vy
  } else {
    const rawVx = (x - e.serverX) / dtSec
    const rawVy = (y - e.serverY) / dtSec
    e.velX = e.velX * (1 - VEL_EMA_ALPHA) + rawVx * VEL_EMA_ALPHA
    e.velY = e.velY * (1 - VEL_EMA_ALPHA) + rawVy * VEL_EMA_ALPHA
  }
  e.velDt = dt

  e.errorX = e.lastPredX - x
  e.errorY = e.lastPredY - y

  e.serverX = x
  e.serverY = y
  e.serverTime = now
  e.targetX = targetX
  e.targetY = targetY
}

function advanceAndRead(e: OrgPrediction): [number, number] {
  const now = performance.now()
  const frameDt = Math.max(0.001, (now - e.lastReadTime) * 0.001)
  e.lastReadTime = now

  const totalElapsed = now - e.serverTime
  const extrap = Math.min(totalElapsed, MAX_EXTRAP_MS) * 0.001

  // Velocity-based dead reckoning
  let outX = e.serverX + e.velX * extrap
  let outY = e.serverY + e.velY * extrap

  // Blend toward target-based prediction as extrapolation grows.
  // This curves the organism toward its actual destination instead of
  // sliding in a straight line past it.
  if (e.targetX !== undefined && e.targetY !== undefined) {
    const tdx = e.targetX - e.serverX
    const tdy = e.targetY - e.serverY
    const tdist = Math.sqrt(tdx * tdx + tdy * tdy)
    if (tdist > 1.5) {
      const speed = Math.max(Math.sqrt(e.velX * e.velX + e.velY * e.velY), TILES_PER_SECOND * 0.5)
      const moveAmt = Math.min(tdist, speed * extrap)
      const tpX = e.serverX + (tdx / tdist) * moveAmt
      const tpY = e.serverY + (tdy / tdist) * moveAmt
      // blend factor: 0 at extrap=0, grows to ~0.6 at max extrap
      const blend = Math.min(extrap / (MAX_EXTRAP_MS * 0.001), 1.0) * 0.6
      outX = outX + (tpX - outX) * blend
      outY = outY + (tpY - outY) * blend
    }
  }

  // Incremental error correction using actual frame delta
  const decay = Math.exp(-ERROR_DECAY_PER_S * frameDt)
  e.errorX *= decay
  e.errorY *= decay

  outX += e.errorX
  outY += e.errorY

  const speed2 = e.velX * e.velX + e.velY * e.velY
  if (speed2 > 0.01) {
    const target = Math.atan2(e.velX, e.velY)
    let diff = target - e.heading
    while (diff > Math.PI) diff -= Math.PI * 2
    while (diff < -Math.PI) diff += Math.PI * 2
    const maxStep = HEADING_TURN_RATE * frameDt
    if (Math.abs(diff) <= maxStep) e.heading = target
    else e.heading += Math.sign(diff) * maxStep
  }

  e.lastPredX = outX
  e.lastPredY = outY
  return [outX, outY]
}
