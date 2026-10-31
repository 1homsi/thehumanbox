import init, { Sim } from '../wasm/sim-core/sim_core.js'
import wasmUrl from '../wasm/sim-core/sim_core_bg.wasm?url'
import initThreadedWasm, {
  Sim as ThreadedSim,
  initThreadPool,
} from '../wasm/sim-core-threads/sim_core_threads.js'
import threadedWasmUrl from '../wasm/sim-core-threads/sim_core_threads_bg.wasm?url'
import { logger } from '../shared/logger'
import { threadCount, wantsThreads } from './wasmThreads'

/** The engine's class. Both builds export the same API, so the worker uses either one the same way. */
export type SimClass = typeof Sim

export interface SimEngine {
  Sim: SimClass
  /** Threads the engine computes on: 1 for the single-thread build. */
  threads: number
}

/**
 * Start the engine this worker can run. A cross-origin isolated page gets the threaded build on a pool of
 * workers; if that cannot start, or the page is not isolated, the single-thread build starts instead. Both
 * builds give the same world for a seed, so a save loads in either.
 */
export async function startSimEngine(): Promise<SimEngine> {
  if (wantsThreads(self)) {
    const threads = threadCount(navigator.hardwareConcurrency)
    try {
      await initThreadedWasm({ module_or_path: threadedWasmUrl })
      await initThreadPool(threads)
      return { Sim: ThreadedSim as SimClass, threads }
    } catch (error) {
      logger.warn('wasm', 'threaded sim unavailable, using one thread:', error)
    }
  }
  await init({ module_or_path: wasmUrl })
  return { Sim, threads: 1 }
}
