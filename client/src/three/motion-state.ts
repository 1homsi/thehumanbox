import type { OrganismState, AnimalState } from '../types'

// Per-entity prev/current positions + the wall-clock timestamp of the
// last update. Components call getInterpolatedXY() each frame to get
// a smooth position lerped from prev to current. Extrapolation beyond
// t=1 is allowed up to t=2 (one full WS interval) for dead-reckoning
// when the next packet is late.

interface Entry {
  prevX: number; prevY: number
  curX:  number; curY:  number
  lastUpdate: number
}

const orgState    = new Map<string, Entry>()
const animalState = new Map<number, Entry>()

// Assumed WS interval. NETWORK_MS on the server is 100ms; we lerp
// over that. Slight underestimate is better than overestimate (faster
// catch-up to truth) so motion never visibly stalls.
const TICK_MS = 100

export function updateOrgMotion(organisms: OrganismState[]) {
  const now = performance.now()
  for (const o of organisms) {
    if (!o.alive) continue
    const e = orgState.get(o.id)
    if (e) {
      // Only treat this as a NEW snapshot if position actually
      // changed - otherwise we keep extrapolating from the same
      // prev/cur pair instead of jumping back to cur.
      if (e.curX !== o.x || e.curY !== o.y) {
        e.prevX = e.curX
        e.prevY = e.curY
        e.curX  = o.x
        e.curY  = o.y
        e.lastUpdate = now
      }
    } else {
      orgState.set(o.id, {
        prevX: o.x, prevY: o.y, curX: o.x, curY: o.y, lastUpdate: now,
      })
    }
  }
}

export function getOrgXY(id: string): [number, number] {
  const e = orgState.get(id)
  if (!e) return [0, 0]
  const dt = performance.now() - e.lastUpdate
  const t  = Math.max(0, Math.min(2, dt / TICK_MS))
  return [
    e.prevX + (e.curX - e.prevX) * t,
    e.prevY + (e.curY - e.prevY) * t,
  ]
}

export function getOrgVelocityXY(id: string): [number, number] {
  const e = orgState.get(id)
  if (!e) return [0, 0]
  return [e.curX - e.prevX, e.curY - e.prevY]
}

export function updateAnimalMotion(animals: AnimalState[]) {
  const now = performance.now()
  for (const a of animals) {
    const e = animalState.get(a.id)
    if (e) {
      if (e.curX !== a.x || e.curY !== a.y) {
        e.prevX = e.curX
        e.prevY = e.curY
        e.curX  = a.x
        e.curY  = a.y
        e.lastUpdate = now
      }
    } else {
      animalState.set(a.id, {
        prevX: a.x, prevY: a.y, curX: a.x, curY: a.y, lastUpdate: now,
      })
    }
  }
}

export function getAnimalXY(id: number): [number, number] {
  const e = animalState.get(id)
  if (!e) return [0, 0]
  const dt = performance.now() - e.lastUpdate
  const t  = Math.max(0, Math.min(2, dt / TICK_MS))
  return [
    e.prevX + (e.curX - e.prevX) * t,
    e.prevY + (e.curY - e.prevY) * t,
  ]
}
