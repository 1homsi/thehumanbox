import { trackEvent } from '../shared/observability'
import type { SingleThreadReason } from './wasmThreads'

/** How the worker's world start went, phase by phase: sent with `ready` and reported as `world_startup`. */
export interface WorkerStartup {
  /** The engine that runs the world. */
  engine: 'threads' | 'single'
  threads: number
  /** Why the single-thread engine runs, or null for the threaded one. */
  fallback: SingleThreadReason | null
  /** Fetching, compiling and starting the engine (and its thread pool). */
  engine_ms: number
  /** Waiting for the lock that keeps two tabs from writing one save. */
  lock_ms: number
  /** Reading and restoring the save, or resetting it; near zero for a first visit. */
  restore_ms: number
  /** Generating a new world; zero when a save was restored. */
  generate_ms: number
  /** From the start message to ready. */
  total_ms: number
}

const MS_FIELDS = ['engine_ms', 'lock_ms', 'restore_ms', 'generate_ms', 'total_ms'] as const

/** The startup report in a worker message, or null when it is missing or malformed. */
export function readStartup(value: unknown): WorkerStartup | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  if (v.engine !== 'threads' && v.engine !== 'single') return null
  if (typeof v.threads !== 'number') return null
  if (
    v.fallback !== null &&
    v.fallback !== 'not_isolated' &&
    v.fallback !== 'failed' &&
    v.fallback !== 'slow'
  )
    return null
  if (!MS_FIELDS.every((field) => typeof v[field] === 'number' && Number.isFinite(v[field]))) return null
  return v as unknown as WorkerStartup
}

/**
 * Report a world start once per page: the worker's phases, plus how long the page had been open, which also counts
 * loading the page and the worker script before the start message.
 */
let reported = false
export function reportWorldStartup(startup: WorkerStartup, pageMs: number): void {
  if (reported) return
  reported = true
  trackEvent('world_startup', { ...startup, page_ms: Math.round(pageMs) })
}

/** Tests only. */
export function resetStartupReport(): void {
  reported = false
}
