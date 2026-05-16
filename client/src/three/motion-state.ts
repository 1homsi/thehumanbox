import type { OrganismState, AnimalState } from '../types'

// ─────────────────────────────────────────────────────────────────────
// Client-side prediction for organisms / animals.
//
// We get server snapshots over WS every TICK_MS (~100ms). Between
// ticks the renderer runs at 60-120 FPS, so we have to invent the
// frames in between. The naive approach (lerp prev->cur) waits to
// see two snapshots before moving anything, so every render frame is
// 50-100ms behind the actual server state. Worse, when the server
// sends a new position it lands as a hard step.
//
// What we do instead:
//   1. DEAD RECKONING - track per-org velocity from the last 2-3
//      snapshots, smoothed with an exponential filter. Each render
//      frame extrapolates: predicted = server + velocity * dt.
//   2. RUBBER-BAND ERROR CORRECTION - when a new snapshot arrives
//      we measure the gap between what we were showing and what
//      the server now says is true. We store that as an "error"
//      vector and smoothly drain it via exp(-k*dt). The render
//      output is (predicted_from_velocity) - (decaying_error), so
//      the visible character glides toward truth instead of
//      snapping to it.
//   3. HEADING SMOOTHING - the predicted yaw turns toward the
//      velocity direction over ~250ms via angular lerp so the
//      character starts facing where they're going before they
//      actually move. (Eliminates "skating sideways" feel.)
//   4. ADAPTIVE EXTRAPOLATION - we only extrapolate for up to
//      ~2x TICK_MS. Beyond that the org gets frozen on its last
//      known position (likely the server has paused them or they
//      died). This avoids characters wandering off to infinity
//      when the network hiccups.
//
// All state is module-level so any component can read predicted
// position synchronously inside useFrame without re-renders.

interface OrgPrediction {
  // ── Server-known truth from the most recent WS snapshot ────────
  serverX: number
  serverY: number
  // performance.now() when serverX/Y was set
  serverTime: number

  // ── Smoothed velocity (units / second) ─────────────────────────
  velX: number
  velY: number
  // Time difference of the snapshot pair that produced velX/Y.
  // Used to gate extrapolation: if the last snapshot pair was a
  // long delay, the velocity is suspect, so we extrapolate less.
  velDt: number

  // ── Error left over from the previous prediction ───────────────
  // When a new snapshot arrives, errorX = (predicted_at_arrival -
  // new_serverX). It decays exponentially toward 0 every render
  // frame, so the render output blends smoothly from our wrong
  // prediction toward the new truth.
  errorX: number
  errorY: number

  // ── Predicted heading (radians, atan2 convention) ──────────────
  heading: number
  // Last predicted position (used to compute the angular target
  // and to derive errorX/Y on snapshot arrival).
  lastPredX: number
  lastPredY: number
}

interface AnimalPrediction extends OrgPrediction {}

const orgState    = new Map<string, OrgPrediction>()
const animalState = new Map<number, AnimalPrediction>()

// WS server tick interval. Real value is set by the server's
// NETWORK_MS (currently 100ms). Slight underestimate means we
// reach server-truth on time even if a packet is late.
const TICK_MS = 100

// Exponential error-decay constant. Pick k so that error decays to
// ~5% of original within 200ms. exp(-k*200) = 0.05 => k = ln(20)/200
// ≈ 0.015 per ms. We use per-frame dt in seconds, so k_per_s ≈ 15.
const ERROR_DECAY_PER_S = 15

// Velocity EMA blend. New observation weight = 0.45 means we react
// quickly to changes (one fresh measurement contributes ~half),
// but still smooth out tiny jitter from rounding.
const VEL_EMA_ALPHA = 0.45

// Angular slew for predicted heading - radians/second. Pi rad/s
// means full 180° turn in 1 second. Feels responsive without
// snapping.
const HEADING_TURN_RATE = Math.PI

// Max extrapolation time. After this many ms past the last
// snapshot we stop extrapolating and just hold position. Avoids
// runaway drift during network hiccups.
const MAX_EXTRAP_MS = 250

// ── Public API ───────────────────────────────────────────────────────

export function updateOrgMotion(organisms: OrganismState[]) {
  const now = performance.now()
  for (const o of organisms) {
    if (!o.alive) continue
    const entry = orgState.get(o.id)
    if (entry) {
      ingestSnapshot(entry, o.x, o.y, now)
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

// Returns the predicted yaw angle (atan2 convention: angle to turn
// the +Z axis toward the velocity vector). Smoothly slews so the
// org faces motion direction before they finish stepping.
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

// ── Internal helpers ────────────────────────────────────────────────

function fresh(x: number, y: number, now: number): OrgPrediction {
  return {
    serverX: x, serverY: y, serverTime: now,
    velX: 0, velY: 0, velDt: TICK_MS,
    errorX: 0, errorY: 0,
    heading: 0,
    lastPredX: x, lastPredY: y,
  }
}

function ingestSnapshot(e: OrgPrediction, x: number, y: number, now: number) {
  // Only treat this as a new arrival if the server position actually
  // changed - otherwise the same WS frame is being re-applied to a
  // dedup-stuck snapshot and we shouldn't reset our velocity.
  if (e.serverX === x && e.serverY === y && now - e.serverTime < TICK_MS * 0.5) {
    return
  }

  const dt = Math.max(1, now - e.serverTime)
  const dtSec = dt * 0.001
  // Raw instantaneous velocity from this snapshot pair.
  const rawVx = (x - e.serverX) / dtSec
  const rawVy = (y - e.serverY) / dtSec

  // EMA smoothing keeps velocity stable through small jitter while
  // still reacting fast to genuine direction changes.
  e.velX = e.velX * (1 - VEL_EMA_ALPHA) + rawVx * VEL_EMA_ALPHA
  e.velY = e.velY * (1 - VEL_EMA_ALPHA) + rawVy * VEL_EMA_ALPHA
  e.velDt = dt

  // Measure the error between what we were rendering at the moment
  // this snapshot arrived and what the server now says is true.
  // The renderer will smoothly drain this in advanceAndRead().
  e.errorX = e.lastPredX - x
  e.errorY = e.lastPredY - y

  e.serverX = x
  e.serverY = y
  e.serverTime = now
}

function advanceAndRead(e: OrgPrediction): [number, number] {
  const now = performance.now()
  const dt = now - e.serverTime
  // Cap extrapolation - if the network hiccups, freeze rather than
  // drift off.
  const extrap = Math.min(dt, MAX_EXTRAP_MS) * 0.001

  // Dead-reckoned position assuming current smoothed velocity.
  const reckonedX = e.serverX + e.velX * extrap
  const reckonedY = e.serverY + e.velY * extrap

  // Drain the carry-over error from the last snapshot via expo decay.
  // We measure frame dt from the previous read; for simplicity, just
  // decay by ERROR_DECAY_PER_S * frame_dt where frame_dt ≈ time since
  // the snapshot. This converges fast enough in practice.
  const decay = Math.exp(-ERROR_DECAY_PER_S * extrap)
  e.errorX *= decay
  e.errorY *= decay

  const outX = reckonedX + e.errorX
  const outY = reckonedY + e.errorY

  // Heading slew toward velocity direction (skipped when nearly
  // stationary so the org doesn't flip when stopping).
  const speed2 = e.velX * e.velX + e.velY * e.velY
  if (speed2 > 0.01) {
    const target = Math.atan2(e.velX, e.velY)
    // Shortest angular path. Use frame_dt = extrap since last read.
    // Approx: limit per-frame turn to HEADING_TURN_RATE * dt.
    const frameDt = Math.max(0.001, extrap)
    let diff = target - e.heading
    while (diff >  Math.PI) diff -= Math.PI * 2
    while (diff < -Math.PI) diff += Math.PI * 2
    const maxStep = HEADING_TURN_RATE * frameDt
    if (Math.abs(diff) <= maxStep) e.heading = target
    else                            e.heading += Math.sign(diff) * maxStep
  }

  e.lastPredX = outX
  e.lastPredY = outY
  return [outX, outY]
}
