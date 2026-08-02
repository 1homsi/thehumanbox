import init, { Sim } from '../wasm/sim-core/sim_core.js'
import wasmUrl from '../wasm/sim-core/sim_core_bg.wasm?url'
import {
  archiveAndDeleteWorld,
  listRecoveryWorlds,
  loadWorld,
  recoveryPrefix,
  restoreRecoveryWorld,
  saveWorld,
  type SavedWorld,
} from './wasmDb'
import {
  findRequestedRecovery,
  rememberStorageRetry,
  runReloadCheckpoint,
  runStorageRetry,
  type StorageRetry,
} from './wasmPersistence'
import { WEB_BASE_TICK_MS, WEB_POPULATION_LIMIT } from './webRuntime'

type StartMsg = {
  type: 'start'
  id: string
  seed: string
  tickMs?: number
  stepsPerEmit?: number
  autosaveEveryMs?: number
  reset?: boolean
  recoveryId?: string | null
}
type InMsg =
  | StartMsg
  | { type: 'pause'; requestId?: number }
  | { type: 'resume'; requestId?: number }
  | { type: 'visibility'; hidden: boolean }
  | { type: 'save'; requestId?: number }
  | { type: 'retry_storage'; requestId?: number }
  | { type: 'prepare_reload'; requestId: number; deadlineAt: number }
  | { type: 'stop' }
  | { type: 'command'; json: string; requestId: number }
  | { type: 'org_detail'; id: string; requestId: number }
  | { type: 'org_life'; id: string; requestId: number }
  | { type: 'speed'; tickMs: number; requestId?: number }

const DEEP_FULL_EVERY_TICKS = 600n
// Full world saves can be tens of megabytes. Commands and shutdowns
// checkpoint immediately; this slower cadence covers passive play without
// repeatedly stalling the simulation worker on JSON serialization.
const DEFAULT_AUTOSAVE_MS = 30_000

let sim: Sim | null = null
let worldId = 'browser-own'
let seed = '0'
let tickMs = WEB_BASE_TICK_MS
let stepsPerEmit = 1
let autosaveEveryMs = DEFAULT_AUTOSAVE_MS
let frameId = 0
let started = false
let manuallyPaused = false
let hiddenPaused = false
let reloadPreparing = false
let tickTimer: ReturnType<typeof setInterval> | null = null
let saveTimer: ReturnType<typeof setInterval> | null = null
let persistInFlight: Promise<boolean> | null = null
let persistAgain = false
let storageReady = true
let storageRetry: StorageRetry<SavedWorld> | null = null
let recoveryFallbackRetry: StorageRetry<SavedWorld> | null = null
let storageRetryInFlight: Promise<boolean> | null = null
let worldLockAcquired = true
let releaseWorldLock: (() => void) | null = null

function post(msg: unknown) {
  ;(self as unknown as Worker).postMessage(msg)
}

async function acquireWorldLock(id: string): Promise<boolean> {
  // Web Locks are shared by every tab and worker on this origin. Holding one
  // for the worker lifetime prevents two independently advancing worlds from
  // racing to overwrite the same IndexedDB record.
  if (!('locks' in navigator)) return true

  let resolveDecision: (acquired: boolean) => void = () => {}
  let decided = false
  const decision = new Promise<boolean>((resolve) => {
    resolveDecision = resolve
  })
  let releaseHold: () => void = () => {}
  const hold = new Promise<void>((resolve) => {
    releaseHold = resolve
  })
  const decide = (acquired: boolean) => {
    if (decided) return
    decided = true
    resolveDecision(acquired)
  }

  void navigator.locks
    .request(`thehumanbox-world:${id}`, { mode: 'exclusive', ifAvailable: true }, async (lock) => {
      decide(lock !== null)
      if (!lock) return
      releaseWorldLock = releaseHold
      await hold
    })
    .catch((error: unknown) => {
      decide(false)
      post({
        type: 'error',
        message: `could not lock local save: ${error instanceof Error ? error.message : String(error)}`,
      })
    })

  return decision
}

async function releaseLocalWorldLock() {
  releaseWorldLock?.()
  releaseWorldLock = null
  // The Web Locks API releases only after its async callback returns. Yield a
  // task so a freshly reloaded worker cannot race the previous callback.
  await new Promise((resolve) => setTimeout(resolve, 0))
}

function emit(deepFull: boolean) {
  if (!sim) return
  frameId += 1
  const now = Date.now()
  const frame = deepFull ? sim.fullFrame(frameId, now) : sim.deltaFrame(frameId, now)
  post({ type: 'frame', frame })
}

function rememberRetry(next: StorageRetry<SavedWorld>) {
  storageRetry = rememberStorageRetry(storageRetry, next)
}

function restoreSavedWorld(saved: SavedWorld): Sim {
  if (saved.blob.byteLength === 0) throw new Error('save is empty')
  const candidate = Sim.fromSerialized(BigInt(saved.seed), saved.blob)
  const restoredTick = Number(candidate.tickCount())
  if (restoredTick !== saved.tick) {
    candidate.free()
    throw new Error(`save expected tick ${saved.tick}, restored tick ${restoredTick}`)
  }
  candidate.setPopulationLimit(WEB_POPULATION_LIMIT)
  return candidate
}

function createBrowserSimulation(nextSeed: string): Sim {
  const candidate = new Sim(BigInt(nextSeed))
  candidate.setPopulationLimit(WEB_POPULATION_LIMIT)
  return candidate
}

function replaceSimulation(candidate: Sim, nextSeed: string) {
  const previous = sim
  sim = candidate
  seed = nextSeed
  previous?.free()
}

function markStorageReady(restored: boolean) {
  storageReady = true
  storageRetry = null
  recoveryFallbackRetry = null
  post({ type: 'storage_ready', restored, tick: Number(sim?.tickCount() ?? 0n) })
}

async function persist(): Promise<boolean> {
  if (!sim || !storageReady) return false
  if (persistInFlight) {
    persistAgain = true
    return persistInFlight
  }

  persistInFlight = (async () => {
    try {
      do {
        persistAgain = false
        if (!sim) return false
        const tick = Number(sim.tickCount())
        post({ type: 'saving', tick })
        const blob = sim.serialize()
        if (blob.byteLength === 0) throw new Error('simulation produced an empty save')
        const savedAt = Date.now()
        await saveWorld(worldId, { blob, seed, tick, savedAt })
        post({ type: 'saved', tick, savedAt })
      } while (persistAgain)
      return true
    } catch (e) {
      post({
        type: 'error',
        retryable: true,
        message: `autosave failed: ${e instanceof Error ? e.message : String(e)}`,
      })
      return false
    }
  })()

  try {
    return await persistInFlight
  } finally {
    persistInFlight = null
  }
}

async function retryReadStorage(): Promise<boolean> {
  const saved = await loadWorld(worldId)
  let restored = false

  if (saved) {
    try {
      const candidate = restoreSavedWorld(saved)
      replaceSimulation(candidate, saved.seed)
      restored = true
    } catch (restoreError) {
      const recoveryId = `${recoveryPrefix(worldId)}${saved.savedAt}`
      try {
        await saveWorld(recoveryId, saved)
      } catch (preserveError) {
        rememberRetry({ kind: 'preserve', world: saved, recoveryId })
        throw preserveError
      }
      post({
        type: 'error',
        retryable: true,
        message: `local save could not be restored; recovery copy kept: ${
          restoreError instanceof Error ? restoreError.message : String(restoreError)
        }`,
      })
    }
  }

  markStorageReady(restored)
  if (restored) emit(true)
  return persist()
}

async function retryResetStorage(resetSeed: string): Promise<boolean> {
  const recoveryId = await archiveAndDeleteWorld(worldId)
  const candidate = createBrowserSimulation(resetSeed)
  replaceSimulation(candidate, resetSeed)
  markStorageReady(false)
  post({ type: 'reset_done', recoveryId })
  emit(true)
  return persist()
}

async function resumeAfterUnavailableRecovery(message: string): Promise<boolean> {
  post({ type: 'error', message })
  post({ type: 'recovery_cancelled' })
  const fallback = recoveryFallbackRetry
  recoveryFallbackRetry = null
  storageRetry = fallback

  if (fallback?.kind === 'read') return retryReadStorage()
  if (fallback?.kind === 'preserve') {
    return retryPreserveStorage(fallback.world, fallback.recoveryId)
  }

  markStorageReady(false)
  return persist()
}

async function retryRestoreStorage(recoveryId: string): Promise<boolean> {
  if (!recoveryId.startsWith(recoveryPrefix(worldId))) {
    return resumeAfterUnavailableRecovery('recovery request is invalid; normal local saving resumed')
  }

  // Re-read the recovery index rather than trusting a stale settings entry.
  // A reset/export in another tab can remove a record between selection and
  // retry; in that case normal saving must resume instead of staying blocked.
  const recoveries = await listRecoveryWorlds(worldId)
  const current = findRequestedRecovery(recoveryId, recoveries)
  if (!current) {
    return resumeAfterUnavailableRecovery('recovery copy no longer exists; normal local saving resumed')
  }

  const recovery = await loadWorld(current.id)
  if (!recovery) {
    return resumeAfterUnavailableRecovery('recovery copy no longer exists; normal local saving resumed')
  }

  let candidate: Sim
  try {
    candidate = restoreSavedWorld(recovery)
  } catch (error) {
    return resumeAfterUnavailableRecovery(
      `recovery copy is unusable; normal local saving resumed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }

  try {
    const previousBackupId = await restoreRecoveryWorld(worldId, current.id)
    replaceSimulation(candidate, recovery.seed)
    markStorageReady(true)
    post({ type: 'recovery_done', recoveryId: current.id, previousBackupId, tick: recovery.tick })
    emit(true)
    return persist()
  } catch (error) {
    candidate.free()
    throw error
  }
}

async function retryPreserveStorage(saved: SavedWorld, recoveryId: string): Promise<boolean> {
  await saveWorld(recoveryId, saved)
  markStorageReady(false)
  return persist()
}

function storageRetryMessage(retry: StorageRetry<SavedWorld> | null, error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error)
  switch (retry?.kind) {
    case 'reset':
      return `could not reset local save: ${detail}`
    case 'restore':
      return `recovery save could not be restored: ${detail}`
    case 'preserve':
      return `local save recovery copy failed; original preserved: ${detail}`
    default:
      return `could not read local save: ${detail}`
  }
}

async function retryStorage(): Promise<boolean> {
  if (storageRetryInFlight) return storageRetryInFlight
  if (!worldLockAcquired) return false
  const retry = storageRetry
  post({ type: 'storage_retrying', tick: Number(sim?.tickCount() ?? 0n) })
  storageRetryInFlight = (async () => {
    try {
      return await runStorageRetry(storageReady, retry, {
        persist,
        read: retryReadStorage,
        reset: retryResetStorage,
        restore: retryRestoreStorage,
        preserve: retryPreserveStorage,
      })
    } catch (error) {
      post({
        type: 'error',
        retryable: true,
        message: storageRetryMessage(storageRetry ?? retry, error),
      })
      return false
    }
  })()
  try {
    return await storageRetryInFlight
  } finally {
    storageRetryInFlight = null
  }
}

function stopTimers() {
  if (tickTimer !== null) {
    clearInterval(tickTimer)
    tickTimer = null
  }
  if (saveTimer !== null) {
    clearInterval(saveTimer)
    saveTimer = null
  }
}

function tickOnce() {
  if (manuallyPaused || hiddenPaused || reloadPreparing || !sim) return
  sim.tickN(stepsPerEmit)
  const tc = sim.tickCount()
  emit(tc % DEEP_FULL_EVERY_TICKS === 0n)
}

function startTickTimer() {
  if (tickTimer !== null) clearInterval(tickTimer)
  tickTimer = setInterval(tickOnce, tickMs)
}

function beginLoop(autosaveEveryMs: number) {
  startTickTimer()
  saveTimer = setInterval(() => {
    if (!manuallyPaused && !hiddenPaused) void persist()
  }, autosaveEveryMs)
}

async function start(msg: StartMsg) {
  if (started) return
  started = true
  worldId = msg.id
  seed = msg.seed
  tickMs = msg.tickMs ?? tickMs
  stepsPerEmit = msg.stepsPerEmit ?? stepsPerEmit
  autosaveEveryMs = msg.autosaveEveryMs ?? DEFAULT_AUTOSAVE_MS

  try {
    await init({ module_or_path: wasmUrl })
  } catch (e) {
    post({
      type: 'error',
      fatal: true,
      message: `wasm init failed: ${e instanceof Error ? e.message : String(e)}`,
    })
    return
  }

  worldLockAcquired = await acquireWorldLock(worldId)
  if (!worldLockAcquired) {
    storageReady = false
    post({
      type: 'error',
      message: 'this local world is already open in another tab; this tab will not overwrite its save',
    })
  }

  let restored = false
  let saved = null
  let resetApplied = false
  if (msg.reset && storageReady) {
    try {
      const recoveryId = await archiveAndDeleteWorld(worldId)
      resetApplied = true
      post({ type: 'reset_done', recoveryId })
    } catch (e) {
      storageReady = false
      rememberRetry({ kind: 'reset', seed: msg.seed })
      post({
        type: 'error',
        retryable: true,
        message: `could not reset local save: ${e instanceof Error ? e.message : String(e)}`,
      })
    }
  }
  if (!resetApplied && msg.recoveryId && storageReady) {
    try {
      if (!msg.recoveryId.startsWith(recoveryPrefix(worldId))) throw new Error('invalid recovery save id')
      const recovery = await loadWorld(msg.recoveryId)
      if (!recovery) throw new Error('recovery save no longer exists')
      if (recovery.blob.byteLength === 0) throw new Error('recovery save is empty')
      const candidate = Sim.fromSerialized(BigInt(recovery.seed), recovery.blob)
      candidate.setPopulationLimit(WEB_POPULATION_LIMIT)
      const recoveredTick = Number(candidate.tickCount())
      candidate.free()
      if (recoveredTick !== recovery.tick) {
        throw new Error(`recovery expected tick ${recovery.tick}, restored tick ${recoveredTick}`)
      }
      const previousBackupId = await restoreRecoveryWorld(worldId, msg.recoveryId)
      saved = recovery
      post({
        type: 'recovery_done',
        recoveryId: msg.recoveryId,
        previousBackupId,
        tick: recovery.tick,
      })
    } catch (e) {
      storageReady = false
      rememberRetry({ kind: 'restore', recoveryId: msg.recoveryId })
      post({
        type: 'error',
        retryable: true,
        message: `recovery save could not be restored: ${e instanceof Error ? e.message : String(e)}`,
      })
    }
  }
  try {
    if (!resetApplied && !saved) saved = await loadWorld(worldId)
  } catch (e) {
    // A read failure is not proof that no save exists. Keep the new world
    // playable, but do not overwrite the primary record until a retry can
    // establish whether it exists.
    storageReady = false
    if (worldLockAcquired) {
      if (storageRetry?.kind === 'restore') recoveryFallbackRetry = { kind: 'read' }
      else rememberRetry({ kind: 'read' })
    }
    post({
      type: 'error',
      retryable: worldLockAcquired,
      message: `could not read local save: ${e instanceof Error ? e.message : String(e)}`,
    })
  }
  if (saved) {
    try {
      if (saved.blob.byteLength === 0) throw new Error('save is empty')
      sim = Sim.fromSerialized(BigInt(saved.seed), saved.blob)
      sim.setPopulationLimit(WEB_POPULATION_LIMIT)
      const restoredTick = Number(sim.tickCount())
      if (restoredTick !== saved.tick) {
        throw new Error(`save expected tick ${saved.tick}, restored tick ${restoredTick}`)
      }
      seed = saved.seed
      restored = true
    } catch (e) {
      // Keep a recovery copy before a fresh world eventually replaces the
      // primary record. This also catches the Rust facade's legacy behavior
      // of silently returning a new simulation for malformed JSON.
      let recoverySaved = false
      const preserveRetry: StorageRetry<SavedWorld> = {
        kind: 'preserve',
        world: saved,
        recoveryId: `${recoveryPrefix(worldId)}${saved.savedAt}`,
      }
      if (storageRetry?.kind === 'restore') recoveryFallbackRetry = preserveRetry
      if (storageReady) {
        try {
          await saveWorld(preserveRetry.recoveryId, saved)
          recoverySaved = true
        } catch (recoveryError) {
          // Never replace the only copy of an unreadable save. The fresh world
          // remains playable, but writes stay disabled until preserving the
          // original succeeds through an in-session retry.
          storageReady = false
          if (storageRetry?.kind === 'restore') recoveryFallbackRetry = preserveRetry
          else rememberRetry(preserveRetry)
          post({
            type: 'error',
            retryable: true,
            message: `local save recovery copy failed; original preserved: ${
              recoveryError instanceof Error ? recoveryError.message : String(recoveryError)
            }`,
          })
        }
      }
      post({
        type: 'error',
        retryable: storageReady || storageRetry !== null,
        message: `local save could not be restored${recoverySaved ? '; recovery copy kept' : ''}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      })
      sim = null
    }
  }
  if (!sim) {
    sim = createBrowserSimulation(seed)
  }

  post({ type: 'ready', restored, tick: Number(sim.tickCount()), persistenceReady: storageReady })

  emit(true)
  beginLoop(autosaveEveryMs)
  // Establish a known-good durable record immediately, including for a
  // brand-new world that is reloaded before the first autosave interval.
  void persist()
}

self.onmessage = (e: MessageEvent) => {
  const msg = e.data as InMsg
  switch (msg.type) {
    case 'start':
      void start(msg)
      break
    case 'pause':
      if (sim) manuallyPaused = true
      if (msg.requestId !== undefined) {
        post({
          type: 'runtime_result',
          requestId: msg.requestId,
          ok: sim !== null,
          paused: manuallyPaused,
          tickMs,
        })
      }
      break
    case 'resume':
      if (sim) manuallyPaused = false
      if (msg.requestId !== undefined) {
        post({
          type: 'runtime_result',
          requestId: msg.requestId,
          ok: sim !== null,
          paused: manuallyPaused,
          tickMs,
        })
      }
      break
    case 'visibility':
      hiddenPaused = msg.hidden
      break
    case 'save':
      void persist().then((ok) => {
        if (msg.requestId !== undefined) post({ type: 'save_result', requestId: msg.requestId, ok })
      })
      break
    case 'retry_storage':
      void retryStorage().then((ok) => {
        if (msg.requestId !== undefined) {
          post({ type: 'storage_retry_result', requestId: msg.requestId, ok })
        }
      })
      break
    case 'prepare_reload':
      if (reloadPreparing) {
        post({ type: 'reload_result', requestId: msg.requestId, ok: false })
        break
      }
      // Freeze ticks before serializing. Previously the world kept advancing
      // while IndexedDB committed an older snapshot, then freed the newer
      // in-memory state, losing every tick in between on reload.
      reloadPreparing = true
      void runReloadCheckpoint(msg.deadlineAt, {
        quiesce: stopTimers,
        persist,
        resume: () => {
          reloadPreparing = false
          beginLoop(autosaveEveryMs)
        },
      }).then(async (ok) => {
        if (ok) {
          if (sim) {
            sim.free()
            sim = null
          }
          await releaseLocalWorldLock()
        }
        post({ type: 'reload_result', requestId: msg.requestId, ok })
        if (ok) self.close()
      })
      break
    case 'command':
      if (sim && !reloadPreparing) {
        const ok = sim.command(msg.json)
        if (ok) {
          emit(true)
          // Player actions are important checkpoints. Save them immediately
          // so terrain edits, disasters, and spawned life survive a reload.
          void persist()
        }
        post({ type: 'command_result', requestId: msg.requestId, ok })
      } else {
        post({ type: 'command_result', requestId: msg.requestId, ok: false })
      }
      break
    case 'org_detail':
      post({
        type: 'org_detail_result',
        requestId: msg.requestId,
        json: sim?.orgDetail(msg.id) ?? '',
      })
      break
    case 'org_life':
      post({
        type: 'org_life_result',
        requestId: msg.requestId,
        json: sim?.orgLife(msg.id) ?? '',
      })
      break
    case 'speed':
      if (sim && Number.isFinite(msg.tickMs) && msg.tickMs > 0) {
        tickMs = Math.max(16, msg.tickMs)
        if (tickTimer !== null) startTickTimer()
      }
      if (msg.requestId !== undefined) {
        post({
          type: 'runtime_result',
          requestId: msg.requestId,
          ok: sim !== null && Number.isFinite(msg.tickMs) && msg.tickMs > 0,
          paused: manuallyPaused,
          tickMs,
        })
      }
      break
    case 'stop':
      stopTimers()
      void persist().finally(async () => {
        if (sim) {
          sim.free()
          sim = null
        }
        await releaseLocalWorldLock()
        post({ type: 'stopped' })
        self.close()
      })
      break
  }
}
