import type { OrganismState, AnimalState } from '../../../types'

interface MotionEntry {
  fromX: number
  fromY: number
  toX: number
  toY: number
  segStart: number
  segDur: number
  arrivalEma: number
  lastArrival: number
  velX: number
  velY: number
  heading: number
  dispX: number
  dispY: number
  lastReadTime: number
  lastSeen: number
  targetX: number | undefined
  targetY: number | undefined
}

const orgState = new Map<string, MotionEntry>()
const animalState = new Map<number, MotionEntry>()

const TICK_MS = 100
const MIN_ARRIVAL_MS = 120
const MAX_ARRIVAL_MS = 1500
const SEG_DUR_FACTOR = 1.08
const MIN_SEG_MS = 150
const MAX_SEG_MS = 1600
const GLIDE_DECAY_PER_S = 5
const HEADING_TURN_RATE = Math.PI * 1.4
const TELEPORT_DIST_SQ = 12 * 12
const PRUNE_AFTER_MS = 15000
const PRUNE_EVERY = 120

let pruneCounter = 0

export function updateOrgMotion(organisms: OrganismState[]) {
  const now = performance.now()
  for (const o of organisms) {
    if (!o.alive) continue
    const entry = orgState.get(o.id)
    if (entry) {
      ingestSnapshot(entry, o.x, o.y, now, o.target_x, o.target_y)
    } else {
      orgState.set(o.id, fresh(o.x, o.y, now))
    }
  }
  if (++pruneCounter >= PRUNE_EVERY) {
    pruneCounter = 0
    prune(orgState, now)
    prune(animalState, now)
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
  const g = glideFactor(e)
  return [e.velX * g * TICK_MS * 0.001, e.velY * g * TICK_MS * 0.001]
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

function prune<K>(map: Map<K, MotionEntry>, now: number) {
  for (const [k, e] of map) {
    if (now - e.lastSeen > PRUNE_AFTER_MS) map.delete(k)
  }
}

function fresh(x: number, y: number, now: number): MotionEntry {
  return {
    fromX: x,
    fromY: y,
    toX: x,
    toY: y,
    segStart: now,
    segDur: 1,
    arrivalEma: 0,
    lastArrival: now,
    velX: 0,
    velY: 0,
    heading: 0,
    dispX: x,
    dispY: y,
    lastReadTime: now,
    lastSeen: now,
    targetX: undefined,
    targetY: undefined,
  }
}

function ingestSnapshot(
  e: MotionEntry,
  x: number,
  y: number,
  now: number,
  targetX?: number,
  targetY?: number,
) {
  e.lastSeen = now
  e.targetX = targetX
  e.targetY = targetY
  if (x === e.toX && y === e.toY) return

  const rawDt = now - e.lastArrival
  const dt = Math.max(MIN_ARRIVAL_MS, Math.min(MAX_ARRIVAL_MS, rawDt))
  e.arrivalEma = e.arrivalEma > 0 ? e.arrivalEma * 0.6 + dt * 0.4 : dt
  e.lastArrival = now

  const jx = x - e.dispX
  const jy = y - e.dispY
  if (jx * jx + jy * jy > TELEPORT_DIST_SQ) {
    e.fromX = x
    e.fromY = y
    e.toX = x
    e.toY = y
    e.dispX = x
    e.dispY = y
    e.segStart = now
    e.segDur = 1
    e.velX = 0
    e.velY = 0
    return
  }

  e.fromX = e.dispX
  e.fromY = e.dispY
  e.toX = x
  e.toY = y
  e.segStart = now
  e.segDur = Math.max(MIN_SEG_MS, Math.min(MAX_SEG_MS, e.arrivalEma * SEG_DUR_FACTOR))
  const segSec = e.segDur * 0.001
  e.velX = (e.toX - e.fromX) / segSec
  e.velY = (e.toY - e.fromY) / segSec
}

function glideFactor(e: MotionEntry): number {
  const over = (performance.now() - e.segStart) * 0.001 - e.segDur * 0.001
  if (over <= 0) return 1
  return Math.exp(-GLIDE_DECAY_PER_S * over)
}

function advanceAndRead(e: MotionEntry): [number, number] {
  const now = performance.now()
  const frameDt = Math.max(0.001, (now - e.lastReadTime) * 0.001)
  e.lastReadTime = now

  const elapsed = now - e.segStart
  const t = elapsed / e.segDur

  let outX: number
  let outY: number
  if (t <= 1) {
    outX = e.fromX + (e.toX - e.fromX) * t
    outY = e.fromY + (e.toY - e.fromY) * t
  } else {
    const overSec = (elapsed - e.segDur) * 0.001
    const slide = (1 - Math.exp(-GLIDE_DECAY_PER_S * overSec)) / GLIDE_DECAY_PER_S
    outX = e.toX + e.velX * slide
    outY = e.toY + e.velY * slide
  }

  const g = t <= 1 ? 1 : glideFactor(e)
  const vx = e.velX * g
  const vy = e.velY * g
  if (vx * vx + vy * vy > 0.04) {
    const target = Math.atan2(vx, vy)
    let diff = target - e.heading
    while (diff > Math.PI) diff -= Math.PI * 2
    while (diff < -Math.PI) diff += Math.PI * 2
    const maxStep = HEADING_TURN_RATE * frameDt
    if (Math.abs(diff) <= maxStep) e.heading = target
    else e.heading += Math.sign(diff) * maxStep
  }

  e.dispX = outX
  e.dispY = outY
  return [outX, outY]
}
