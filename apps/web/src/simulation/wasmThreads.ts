/** Most threads the browser sim runs on, so a laptop keeps cores free for the rest of the machine. */
export const MAX_SIM_THREADS = 4

/**
 * How long the worker pool may take to start. A pool that starts takes milliseconds; one whose worker never
 * loads never settles, so after this the worker falls back to the single-thread engine.
 */
export const POOL_START_MS = 10_000

/** Rejects if `work` has not settled within `ms`, so a stalled start cannot hold the worker forever. */
export function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`not started after ${ms} ms`)), ms)
  })
  return Promise.race([work, expired]).finally(() => clearTimeout(timer))
}

/**
 * Whether this page can run the threaded engine. Browsers only give out SharedArrayBuffer on a cross-origin
 * isolated page (the COOP and COEP headers in public/_headers). Anywhere else the single-thread engine runs,
 * exactly as before.
 */
export function wantsThreads(scope: { crossOriginIsolated?: boolean; SharedArrayBuffer?: unknown }): boolean {
  return scope.crossOriginIsolated === true && typeof scope.SharedArrayBuffer === 'function'
}

/**
 * How many threads the pool gets: every core but one (the page's own), never more than MAX_SIM_THREADS, and
 * at least one. An unknown core count gets one thread.
 */
export function threadCount(cores: number | undefined): number {
  const known = typeof cores === 'number' && Number.isFinite(cores) ? Math.floor(cores) : 1
  return Math.max(1, Math.min(known - 1, MAX_SIM_THREADS))
}
