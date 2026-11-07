/**
 * The effects playing on the map right now: pixel effects where a god tool lands, the short result
 * text that floats up from that spot, and the screen shake of the big ones. Anything may add to it
 * (the command sender does, see `withActionFx`); `ActionFxLayer` draws it and sleeps when it is empty.
 *
 * Positions are world tiles, the same coordinates a command carries, so an effect stays on its spot
 * while the camera moves.
 */
import { FX_SPECS, type FxKind } from './fx-kinds'

export interface ActiveFx {
  id: number
  kind: FxKind
  /** Tile the effect is centred on; null for the effects that fill the whole view (weather). */
  x: number | null
  y: number | null
  /** Reach in tiles. */
  r: number
  start: number
  duration: number
}

export type FloatTone = 'harm' | 'help' | 'info'

export interface FloatText {
  id: number
  text: string
  x: number
  y: number
  tone: FloatTone
  start: number
  /** Floats on one spot stack upward instead of overlapping. */
  slot: number
}

export interface Shake {
  strength: number
  start: number
  duration: number
}

/** Most effects that may play at once: a drag lays many, and the oldest give way. */
const MAX_FX = 24
const MAX_FLOATS = 8
export const FLOAT_MS = 2200

let fxs: ActiveFx[] = []
let floats: FloatText[] = []
let shake: Shake | null = null
let nextId = 1
const listeners = new Set<() => void>()

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

function wake() {
  for (const fn of listeners) fn()
}

/** Plays an effect centred on a tile (or over the whole view when x and y are null). */
export function playFx(kind: FxKind, x: number | null, y: number | null, r: number, at = now()): number {
  const spec = FX_SPECS[kind]
  const id = nextId++
  fxs = [...fxs.slice(-(MAX_FX - 1)), { id, kind, x, y, r: Math.max(1, r), start: at, duration: spec.ms }]
  if (
    spec.shake > 0 &&
    (!shake || spec.shake >= shake.strength * (1 - (at - shake.start) / shake.duration))
  ) {
    shake = { strength: spec.shake, start: at + (spec.shakeDelay ?? 0), duration: spec.shakeMs ?? 600 }
  }
  wake()
  return id
}

/** Floats a short line of text up from a tile. */
export function showFloat(text: string, x: number, y: number, tone: FloatTone, at = now()): void {
  const live = floats.filter((f) => at - f.start < FLOAT_MS)
  const slot = live.filter((f) => Math.abs(f.x - x) < 3 && Math.abs(f.y - y) < 3).length
  floats = [...live.slice(-(MAX_FLOATS - 1)), { id: nextId++, text, x, y, tone, start: at, slot }]
  wake()
}

/** What is playing at `t`, after dropping what has finished. */
export function snapshot(t = now()): { fxs: ActiveFx[]; floats: FloatText[]; shake: Shake | null } {
  if (fxs.some((f) => t - f.start >= f.duration)) fxs = fxs.filter((f) => t - f.start < f.duration)
  if (floats.some((f) => t - f.start >= FLOAT_MS)) floats = floats.filter((f) => t - f.start < FLOAT_MS)
  if (shake && t - shake.start >= shake.duration) shake = null
  return { fxs, floats, shake }
}

export function isIdle(t = now()): boolean {
  const s = snapshot(t)
  return s.fxs.length === 0 && s.floats.length === 0 && !s.shake
}

/** Calls `fn` whenever something new starts playing. Returns the unsubscribe. */
export function subscribeFx(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Test hook: forget everything. */
export function resetFxForTests(): void {
  fxs = []
  floats = []
  shake = null
  nextId = 1
}
