/** Most threads the browser sim runs on, so a laptop keeps cores free for the rest of the machine. */
export const MAX_SIM_THREADS = 4

/**
 * How long the worker pool may take to start. A pool that starts takes milliseconds; one whose worker never
 * loads never settles, so after this the worker falls back to the single-thread engine.
 */
export const POOL_START_MS = 10_000

/**
 * How long fetching and compiling the threaded module may take. It is about 5 MB, so this is longer than the pool
 * start; past it the worker falls back to the single-thread engine.
 */
export const THREADED_WASM_START_MS = 30_000

/**
 * How long the threaded engine starts alone. A start that works takes well under a second on a laptop and a few on
 * a slow machine; past this the single-thread engine starts beside it and whichever is ready first runs the world.
 * Before, a stalled threaded start held the visitor on the splash for the full THREADED_WASM_START_MS plus
 * POOL_START_MS (40 s) before the single-thread engine even began (#923).
 */
export const THREADS_HEAD_START_MS = 3_000

/** Why the single-thread engine runs: the page cannot share memory, the threaded start failed, or it was slower. */
export type SingleThreadReason = 'not_isolated' | 'failed' | 'slow'

export interface EngineChoice<T> {
  engine: T
  /** null when the threaded engine runs. */
  fallback: SingleThreadReason | null
}

/**
 * Start the threaded engine, and the single-thread one too if the threaded start fails or takes longer than
 * `headStart` ms; resolves with whichever is ready first. Rejects only if both fail. `startSingle` is called at most
 * once and only when needed, so a quick threaded start never downloads the second module.
 */
export async function raceEngines<T>(
  threaded: Promise<T>,
  startSingle: () => Promise<T>,
  headStart: number,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<EngineChoice<T>> {
  const early = await Promise.race([
    threaded.then(
      (engine) => ({ state: 'ready' as const, engine }),
      (error: unknown) => ({ state: 'failed' as const, error }),
    ),
    sleep(headStart).then(() => ({ state: 'slow' as const })),
  ])
  if (early.state === 'ready') return { engine: early.engine, fallback: null }
  if (early.state === 'failed') return { engine: await startSingle(), fallback: 'failed' }
  const single = startSingle().then((engine) => ({ engine, fallback: 'slow' as const }))
  const threads = threaded.then((engine) => ({ engine, fallback: null }))
  try {
    return await Promise.any([threads, single])
  } catch (error) {
    throw error instanceof AggregateError ? (error.errors.at(-1) ?? error) : error
  }
}

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
