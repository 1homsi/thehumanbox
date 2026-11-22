import init, { Sim } from '../wasm/sim-core/sim_core.js'
import wasmUrl from '../wasm/sim-core/sim_core_bg.wasm?url'
import initScalar, { Sim as ScalarSim } from '../wasm/sim-core/scalar/sim_core_scalar.js'
import scalarWasmUrl from '../wasm/sim-core/scalar/sim_core_scalar_bg.wasm?url'
import initThreadedWasm, {
  Sim as ThreadedSim,
  initThreadPool,
  reserveHeap,
} from '../wasm/sim-core-threads/sim_core_threads.js'
import threadedWasmUrl from '../wasm/sim-core-threads/sim_core_threads_bg.wasm?url'
import { logger } from '../shared/logger'
import {
  POOL_START_MS,
  raceEngines,
  THREADED_WASM_START_MS,
  THREADS_HEAD_START_MS,
  threadCount,
  mobileWebKit,
  wantsThreads,
  WEBKIT_HEAP_RESERVE_MB,
  WEBKIT_MAX_THREADS,
  webkitEngine,
  withTimeout,
  type SingleThreadReason,
} from './wasmThreads'
import { wasmSimdSupported } from './wasmSimd'

/** The engine's class. Both builds export the same API, so the worker uses either one the same way. */
export type SimClass = typeof Sim

export interface SimEngine {
  Sim: SimClass
  /** Threads the engine computes on: 1 for the single-thread build. */
  threads: number
  /** Why the single-thread build runs, or null for the threaded one. */
  fallback: SingleThreadReason | null
}

/**
 * Start the engine this worker can run. A cross-origin isolated page gets the threaded build on a pool of
 * workers. If that fails, or is still starting after THREADS_HEAD_START_MS, the single-thread build starts beside
 * it and whichever is ready first runs the world; a page that is not isolated only gets the single-thread build.
 * Both builds give the same world for a seed, so a save loads in either.
 */
export async function startSimEngine({ touch = false }: { touch?: boolean } = {}): Promise<SimEngine> {
  const startSingle = async () => {
    // The SIMD module and the scalar module tick the same world. A browser that cannot
    // validate WASM SIMD never instantiates the SIMD bytes.
    if (wasmSimdSupported()) {
      await init({ module_or_path: wasmUrl })
      return { Sim, threads: 1 }
    }
    logger.warn('wasm', 'wasm SIMD unavailable; using the scalar engine')
    await initScalar({ module_or_path: scalarWasmUrl })
    return { Sim: ScalarSim as SimClass, threads: 1 }
  }
  if (!wantsThreads(self)) return { ...(await startSingle()), fallback: 'not_isolated' }
  if (mobileWebKit(navigator.userAgent, touch)) return { ...(await startSingle()), fallback: 'webkit' }

  const webkit = webkitEngine(navigator.userAgent)
  const cores = threadCount(navigator.hardwareConcurrency)
  const threads = webkit ? Math.min(cores, WEBKIT_MAX_THREADS) : cores
  const threaded = (async () => {
    await withTimeout(initThreadedWasm({ module_or_path: threadedWasmUrl }), THREADED_WASM_START_MS)
    if (webkit && !reserveHeap(WEBKIT_HEAP_RESERVE_MB)) throw new Error('could not reserve the heap')
    // wasm-bindgen-rayon keeps its spawned workers in module state with no way to stop them, so a stalled pool
    // stays as idle workers beside the single-thread engine; the timeout only stops the wait.
    await withTimeout(initThreadPool(threads), POOL_START_MS)
    return { Sim: ThreadedSim as SimClass, threads }
  })()
  threaded.catch((error: unknown) => logger.warn('wasm', 'threaded sim unavailable:', error))
  const { engine, fallback } = await raceEngines(threaded, startSingle, THREADS_HEAD_START_MS)
  if (fallback) logger.warn('wasm', `using one thread (${fallback})`)
  return { ...engine, fallback }
}
