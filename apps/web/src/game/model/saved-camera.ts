import { readOwnWorldSeed } from '../../simulation/worldSource'
import type { MapCamera, MapSize } from '../render/camera-controls'

const KEY = 'thb-map-camera'
/** How long the camera must stay put before it is written down: a drag writes once, not every frame. */
const SAVE_DELAY_MS = 400

interface Saved extends MapCamera {
  /** The world it was looking at: its seed, so a new world (a reset, a recovery from another seed) opens whole. */
  world: string
  w: number
  h: number
}

function worldKey(): string {
  return readOwnWorldSeed() ?? 'native'
}

/**
 * Where the player left the camera on this world, or null: a first visit, another world, or a map of
 * another size. The map then opens on the whole world.
 */
export function readSavedCamera(world: MapSize): MapCamera | null {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return null
    const saved = JSON.parse(raw) as Partial<Saved>
    if (saved.world !== worldKey() || saved.w !== world.w || saved.h !== world.h) return null
    const { x, y, zoom } = saved
    if (![x, y, zoom].every((n) => typeof n === 'number' && Number.isFinite(n)) || !(zoom! > 0)) return null
    return { x: x!, y: y!, zoom: zoom! }
  } catch {
    return null
  }
}

/** Set while the page reloads into another world: nothing more is written down for the old one. */
let frozen = false

function write(camera: MapCamera, world: MapSize): void {
  if (frozen) return
  try {
    const saved: Saved = { ...camera, world: worldKey(), w: world.w, h: world.h }
    window.localStorage.setItem(KEY, JSON.stringify(saved))
  } catch {
    // Private windows and full storage: the map just opens whole next time.
  }
}

let pending: { camera: MapCamera; world: MapSize } | null = null
let timer: ReturnType<typeof setTimeout> | null = null

/** Remember the camera, once it has been still for a moment. */
export function saveCamera(camera: MapCamera, world: MapSize): void {
  pending = { camera: { ...camera }, world }
  if (timer !== null) clearTimeout(timer)
  timer = setTimeout(flushSavedCamera, SAVE_DELAY_MS)
}

/** Write a camera still waiting to be saved now: the page is going away. */
export function flushSavedCamera(): void {
  if (timer !== null) clearTimeout(timer)
  timer = null
  if (pending) write(pending.camera, pending.world)
  pending = null
}

/** Forget the camera: the world it looked at was swapped for another. */
export function clearSavedCamera(): void {
  if (timer !== null) clearTimeout(timer)
  timer = null
  pending = null
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    // nothing saved, nothing to forget
  }
}

/**
 * Forget the camera for a reload into another world (a reset or a recovery). The page is about to go, and a
 * frame or the page-hide flush must not write the old world's view back: a desktop world keeps the same
 * identity across a reset, so that view would open on the new world. `resume` undoes it if the reload fails.
 */
export function forgetSavedCameraForReload(): { resume: () => void } {
  // Kept so a reload that never happens (the worker could not save first) gives the player their view back.
  let kept: string | null = null
  try {
    kept = window.localStorage.getItem(KEY)
  } catch {
    kept = null
  }
  const waiting = pending
  clearSavedCamera()
  frozen = true
  return {
    resume: () => {
      frozen = false
      try {
        if (kept !== null) window.localStorage.setItem(KEY, kept)
      } catch {
        // Storage gone: the next move saves the view again.
      }
      if (waiting) saveCamera(waiting.camera, waiting.world)
    },
  }
}
