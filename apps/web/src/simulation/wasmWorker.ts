import { startSimEngine, type SimClass, type SimEngine } from './wasmEngine'
import type { WorkerStartup } from './startup-timing'
import { logger } from '../shared/logger'
import {
  archiveAndDeleteWorld,
  deleteWorld,
  listRecoveryWorlds,
  listWorldKeys,
  loadWorld,
  moveWorld,
  recoveryPrefix,
  restoreRecoveryWorld,
  saveWorld,
  type SavedWorld,
} from './wasmDb'
import { packSave, SaveFormatError, unpackSave } from './saveContainer'
import {
  migrateStoredWorlds,
  removeMigrationLeftovers,
  writeVerified,
  type WorldStore,
} from './saveMigration'
import {
  findRequestedRecovery,
  rememberStorageRetry,
  runReloadCheckpoint,
  runStorageRetry,
  type StorageRetry,
} from './wasmPersistence'
import { FAILED_OUTCOME, parseCommandOutcome } from './command-outcome'
import type { StartupPhase, WorkerErrorCode } from './worker-errors'
import {
  MAX_RUNTIME_SPEED,
  MIN_RUNTIME_SPEED,
  MIN_WASM_TICK_MS,
  WASM_BASE_TICK_MS,
  wasmTickDelay,
} from './runtimeControls'

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
  | { type: 'visibility'; hidden: boolean; keepRunning?: boolean }
  | { type: 'save'; requestId?: number }
  | { type: 'retry_storage'; requestId?: number }
  | { type: 'prepare_reload'; requestId: number; deadlineAt: number; requireLocalWorld?: boolean }
  | { type: 'stop' }
  | { type: 'command'; json: string; requestId: number; deadlineAt?: number }
  | { type: 'full_frame' }
  | { type: 'org_detail'; id: string; requestId: number }
  | { type: 'org_life'; id: string; requestId: number }
  | {
      type: 'speed'
      tickMs: number
      stepsPerEmit: number
      speed: number
      requestId?: number
    }

// Terrain and cold metadata refresh at the same real-time cadence at every speed.
// A simulation-tick cadence makes fast-forward serialize huge snapshots 50x more often.
const DEEP_FULL_EVERY_MS = 300 * WASM_BASE_TICK_MS
// Full world saves can be tens of megabytes and serialize synchronously on
// this worker, pausing ticks and frame delivery. Commands and shutdowns still
// checkpoint immediately; hidden/pagehide handlers also request a save.
// Five minutes bounds passive-play loss while avoiding a large write every
// 30 seconds.
const DEFAULT_AUTOSAVE_MS = 5 * 60_000
const FAST_BATCH_MS = 32
const MAX_CATCHUP_BATCHES = 2
const TICK_EPSILON = 1e-6
const COMMAND_FULL_FRAME_MS = 250
const COMMAND_SAVE_DEBOUNCE_MS = 1_500
const FULL_FRAME_SPACING = 10
const SAVE_SPACING = 20
const MIGRATION_DELAY_MS = 20_000
const MIGRATION_PAUSE_MS = 2_000
const LOCK_WAIT_MS = 4_000

type SimInstance = InstanceType<SimClass>
// Set when the engine starts, before any world is made or loaded.
let Sim: SimClass
let sim: SimInstance | null = null
let worldId = 'browser-own'
let seed = '0'
let tickMs = WASM_BASE_TICK_MS
let stepsPerEmit = 1
let speed = 1
let autosaveEveryMs = DEFAULT_AUTOSAVE_MS
let frameId = 0
let lastEmittedAt = -Infinity
let lastDeepFullAt = -Infinity
let lastFullFrameCostMs = 0
let lastSaveAt = -Infinity
let lastSaveCostMs = 0
let urgentPersist = false
let packCancel: AbortController | null = null
let containerVerified = false
let migrationTimer: ReturnType<typeof setTimeout> | null = null
let started = false
let manuallyPaused = false
let hiddenPaused = false
// Hidden but still simulating ("keep running in background"): ticks and autosaves
// continue, but no frames go out since nothing draws them. A full frame resyncs on return.
let hiddenRunning = false
let resyncOnReturn = false
// Browsers may throttle a hidden tab's timers to once a second or slower, so while hidden the
// world runs by wall clock: each wake-up runs the ticks owed since the last one. Capped so a
// machine waking from sleep does not replay hours of world at once.
const MAX_BACKGROUND_OWED_MS = 60_000
const MIN_BACKGROUND_SLICE_MS = 50
const MAX_BACKGROUND_SLICE_MS = 500
let backgroundOwedMs = 0
let backgroundClockAt = 0
let owedTicks = 0
let clockAt = 0
let reloadPreparing = false
let tickTimer: ReturnType<typeof setTimeout> | null = null
let saveTimer: ReturnType<typeof setInterval> | null = null
let fullFrameTimer: ReturnType<typeof setTimeout> | null = null
let commandSaveTimer: ReturnType<typeof setTimeout> | null = null
let simFailed = false
let lastPanic: string | null = null
let persistInFlight: Promise<boolean> | null = null
let persistAgain = false
let storageReady = true
let storageRetry: StorageRetry<SavedWorld> | null = null
let recoveryFallbackRetry: StorageRetry<SavedWorld> | null = null
let storageRetryInFlight: Promise<boolean> | null = null
let worldLockAcquired = true
let releaseWorldLock: (() => void) | null = null
let startup: Promise<void> | null = null
let startupRunning = false
let startupPhase: StartupPhase = 'engine'

function post(msg: unknown) {
  ;(self as unknown as Worker).postMessage(msg)
}

function postFrame(frame: Uint8Array) {
  ;(self as unknown as Worker).postMessage({ type: 'frame', frame }, [frame.buffer as ArrayBuffer])
}

const PANIC_PREFIX = 'panicked at'
const workerConsole = globalThis.console
const originalConsoleError = workerConsole.error
workerConsole.error = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].startsWith(PANIC_PREFIX)) lastPanic = args[0]
  originalConsoleError.apply(workerConsole, args)
}

function failSimulation(error: unknown) {
  if (simFailed) return
  simFailed = true
  sim = null
  stopTimers()
  const detail = lastPanic ?? (error instanceof Error ? error.message : String(error))
  logger.warn('wasm', 'simulation crashed:', detail)
  post({ type: 'error', fatal: true, code: 'sim_crashed', message: `the simulation crashed: ${detail}` })
}

function guarded<T>(fallback: T, run: () => T): T {
  if (simFailed) return fallback
  try {
    return run()
  } catch (error) {
    failSimulation(error)
    return fallback
  }
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

  // After a reload the previous page's worker can hold the lock for a moment
  // while it shuts down, so wait briefly instead of giving up at once.
  const wait = new AbortController()
  const giveUp = setTimeout(() => wait.abort(), LOCK_WAIT_MS)
  void navigator.locks
    .request(`thehumanbox-world:${id}`, { mode: 'exclusive', signal: wait.signal }, async (lock) => {
      clearTimeout(giveUp)
      decide(lock !== null)
      if (!lock) return
      releaseWorldLock = releaseHold
      await hold
    })
    .catch((error: unknown) => {
      clearTimeout(giveUp)
      decide(false)
      if (wait.signal.aborted) return
      postError('lock_failed', 'could not lock local save', { error })
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

async function releaseWorldLockAfterStartup() {
  // A reload can arrive while start() is between acquiring the world lock and
  // finishing its reset/restore transaction. Releasing the lock then would let
  // another tab acquire it and race the same IndexedDB record, so keep the lock
  // until the in-flight startup has bailed out of its transaction: start()
  // checks reloadPreparing right after each storage await and returns, and this
  // releases once it has. A bail before the lock is acquired (boot, lock wait)
  // has no transaction to protect, so release straight away.
  const startupHoldsLock = releaseWorldLock !== null
  if (startupHoldsLock) await startup?.catch(() => {})
  await releaseLocalWorldLock()
}

function emit(deepFull: boolean) {
  // Nothing draws a hidden tab; a full frame resyncs it on return.
  if (!sim || hiddenRunning) return
  const running = sim
  frameId += 1
  const now = Date.now()
  lastEmittedAt = performance.now()
  if (deepFull) {
    lastDeepFullAt = lastEmittedAt
    if (fullFrameTimer !== null) {
      clearTimeout(fullFrameTimer)
      fullFrameTimer = null
    }
  }
  const frame = guarded(null, () =>
    deepFull ? running.fullFrameBytes(frameId, now) : running.deltaFrameBytes(frameId, now),
  )
  if (deepFull) lastFullFrameCostMs = performance.now() - lastEmittedAt
  if (frame) postFrame(frame)
}

function requestFullFrame() {
  if (!sim || hiddenRunning) return
  const spacingMs = Math.max(COMMAND_FULL_FRAME_MS, lastFullFrameCostMs * FULL_FRAME_SPACING)
  const waitMs = spacingMs - (performance.now() - lastDeepFullAt)
  if (waitMs <= 0) {
    emit(true)
  } else if (fullFrameTimer === null) {
    fullFrameTimer = setTimeout(() => {
      fullFrameTimer = null
      emit(true)
    }, waitMs)
  }
}

function schedulePersistAfterCommand() {
  if (commandSaveTimer !== null) clearTimeout(commandSaveTimer)
  const spacedUntil = lastSaveAt + lastSaveCostMs * SAVE_SPACING
  commandSaveTimer = setTimeout(
    () => {
      commandSaveTimer = null
      void persist()
    },
    Math.max(COMMAND_SAVE_DEBOUNCE_MS, spacedUntil - performance.now()),
  )
}

function rememberRetry(next: StorageRetry<SavedWorld>) {
  storageRetry = rememberStorageRetry(storageRetry, next)
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function postError(
  code: WorkerErrorCode,
  text: string,
  options: { error?: unknown; retryable?: boolean; fatal?: boolean; phase?: StartupPhase } = {},
) {
  const detail = options.error === undefined ? undefined : errorDetail(options.error)
  post({
    type: 'error',
    code,
    message: detail === undefined ? text : `${text}: ${detail}`,
    ...(detail === undefined ? {} : { detail }),
    ...(options.retryable === undefined ? {} : { retryable: options.retryable }),
    ...(options.fatal === undefined ? {} : { fatal: options.fatal }),
    ...(options.phase === undefined ? {} : { phase: options.phase }),
  })
}

async function restoreSavedWorld(saved: SavedWorld): Promise<SimInstance> {
  if (saved.blob.byteLength === 0) throw new Error('save is empty')
  const candidate = Sim.fromSerialized(BigInt(saved.seed), await unpackSave(saved.blob))
  const restoredTick = Number(candidate.tickCount())
  if (restoredTick !== saved.tick) {
    candidate.free()
    throw new Error(`save expected tick ${saved.tick}, restored tick ${restoredTick}`)
  }
  return candidate
}

function replaceSimulation(candidate: SimInstance, nextSeed: string) {
  const previous = sim
  sim = candidate
  seed = nextSeed
  previous?.free()
  // The page's watches (famine warnings and the like) start over: the world they were watching is gone.
  post({ type: 'world_replaced' })
}

function markStorageReady(restored: boolean) {
  storageReady = true
  storageRetry = null
  recoveryFallbackRetry = null
  post({ type: 'storage_ready', restored, tick: Number(sim?.tickCount() ?? 0n) })
}

const worldStore: WorldStore = {
  load: loadWorld,
  save: saveWorld,
  remove: deleteWorld,
  move: moveWorld,
  keys: listWorldKeys,
}

async function writeCompressed(world: SavedWorld, payload: Uint8Array): Promise<'written' | 'cancelled'> {
  const cancel = new AbortController()
  packCancel = cancel
  let packed: Uint8Array
  try {
    packed = await packSave(payload, { signal: cancel.signal })
  } catch (error) {
    if (cancel.signal.aborted) return 'cancelled'
    logger.warn('wasm', 'save compression failed; saving uncompressed:', error)
    await saveWorld(worldId, world)
    return 'written'
  } finally {
    if (packCancel === cancel) packCancel = null
  }
  const compressed = { ...world, blob: packed }
  if (containerVerified) {
    await saveWorld(worldId, compressed)
    return 'written'
  }
  try {
    await writeVerified(worldStore, worldId, compressed, payload)
    containerVerified = true
  } catch (error) {
    if (!(error instanceof SaveFormatError)) throw error
    logger.warn('wasm', 'compressed save did not read back; saving uncompressed:', error)
    await saveWorld(worldId, world)
  }
  return 'written'
}

function belongsToWorld(key: string): boolean {
  return key === worldId || key.startsWith(recoveryPrefix(worldId))
}

function scheduleRecoveryMigration() {
  migrationTimer = setTimeout(() => {
    migrationTimer = null
    if (!sim || !storageReady || reloadPreparing) return
    const prefix = recoveryPrefix(worldId)
    void migrateStoredWorlds(
      worldStore,
      (key) => key.startsWith(prefix),
      () => new Promise((resolve) => setTimeout(resolve, MIGRATION_PAUSE_MS)),
    )
      .then(({ migrated, failed }) => {
        if (migrated.length || failed.length) {
          logger.info(
            'wasm',
            'recovery saves compressed:',
            migrated.length,
            'kept as they were:',
            failed.length,
          )
        }
      })
      .catch((error: unknown) => logger.warn('wasm', 'recovery save migration stopped:', error))
  }, MIGRATION_DELAY_MS)
}

async function persist(urgent = false): Promise<boolean> {
  if (!sim || !storageReady) return false
  if (urgent) urgentPersist = true
  if (persistInFlight) {
    persistAgain = true
    if (urgent) packCancel?.abort()
    return persistInFlight
  }

  persistInFlight = (async () => {
    try {
      do {
        persistAgain = false
        const quick = urgentPersist
        urgentPersist = false
        const running = sim
        if (!running) return false
        const tick = guarded(null, () => Number(running.tickCount()))
        if (tick === null) return false
        post({ type: 'saving', tick })
        const serializeStartedAt = performance.now()
        const blob = guarded(null, () => running.serialize())
        lastSaveAt = performance.now()
        lastSaveCostMs = lastSaveAt - serializeStartedAt
        if (!blob) return false
        if (blob.byteLength === 0) throw new Error('simulation produced an empty save')
        const savedAt = Date.now()
        const world = { blob, seed, tick, savedAt }
        if (quick) await saveWorld(worldId, world)
        else if ((await writeCompressed(world, blob)) === 'cancelled') continue
        post({ type: 'saved', tick, savedAt })
      } while (persistAgain)
      return true
    } catch (e) {
      postError('autosave_failed', 'autosave failed', { error: e, retryable: true })
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
      const candidate = await restoreSavedWorld(saved)
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
      postError('restore_failed_kept', 'local save could not be restored; recovery copy kept', {
        error: restoreError,
        retryable: true,
      })
    }
  }

  markStorageReady(restored)
  if (restored) emit(true)
  return persist()
}

async function retryResetStorage(resetSeed: string): Promise<boolean> {
  const recoveryId = await archiveAndDeleteWorld(worldId)
  const candidate = new Sim(BigInt(resetSeed))
  replaceSimulation(candidate, resetSeed)
  markStorageReady(false)
  post({ type: 'reset_done', recoveryId })
  emit(true)
  return persist()
}

async function resumeAfterUnavailableRecovery(
  code: WorkerErrorCode,
  text: string,
  error?: unknown,
): Promise<boolean> {
  postError(code, text, { error })
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
    return resumeAfterUnavailableRecovery(
      'recovery_invalid',
      'recovery request is invalid; normal local saving resumed',
    )
  }

  // Re-read the recovery index rather than trusting a stale settings entry.
  // A reset/export in another tab can remove a record between selection and
  // retry; in that case normal saving must resume instead of staying blocked.
  const recoveries = await listRecoveryWorlds(worldId)
  const current = findRequestedRecovery(recoveryId, recoveries)
  if (!current) {
    return resumeAfterUnavailableRecovery(
      'recovery_missing',
      'recovery copy no longer exists; normal local saving resumed',
    )
  }

  const recovery = await loadWorld(current.id)
  if (!recovery) {
    return resumeAfterUnavailableRecovery(
      'recovery_missing',
      'recovery copy no longer exists; normal local saving resumed',
    )
  }

  let candidate: SimInstance
  try {
    candidate = await restoreSavedWorld(recovery)
  } catch (error) {
    return resumeAfterUnavailableRecovery(
      'recovery_unusable',
      'recovery copy is unusable; normal local saving resumed',
      error,
    )
  }

  try {
    const previousBackupId = await restoreRecoveryWorld(worldId, current.id)
    replaceSimulation(candidate, recovery.seed)
    markStorageReady(true)
    post({
      type: 'recovery_done',
      recoveryId: current.id,
      previousBackupId,
      tick: recovery.tick,
      seed: recovery.seed,
    })
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

function storageRetryError(retry: StorageRetry<SavedWorld> | null): [WorkerErrorCode, string] {
  switch (retry?.kind) {
    case 'reset':
      return ['reset_failed', 'could not reset local save']
    case 'restore':
      return ['recovery_restore_failed', 'recovery save could not be restored']
    case 'preserve':
      return ['preserve_failed', 'local save recovery copy failed; original preserved']
    default:
      return ['read_failed', 'could not read local save']
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
      const [code, text] = storageRetryError(storageRetry ?? retry)
      postError(code, text, { error, retryable: true })
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
    clearTimeout(tickTimer)
    tickTimer = null
  }
  if (saveTimer !== null) {
    clearInterval(saveTimer)
    saveTimer = null
  }
  if (fullFrameTimer !== null) {
    clearTimeout(fullFrameTimer)
    fullFrameTimer = null
  }
  if (commandSaveTimer !== null) {
    clearTimeout(commandSaveTimer)
    commandSaveTimer = null
  }
  if (migrationTimer !== null) {
    clearTimeout(migrationTimer)
    migrationTimer = null
  }
}

function msPerTick() {
  return tickMs / stepsPerEmit
}

/** Run the ticks a hidden world owes for the real time since the last wake-up. */
function catchUpInBackground(running: SimInstance, startedAt: number) {
  const sinceLastMs = startedAt - backgroundClockAt
  backgroundOwedMs = Math.min(MAX_BACKGROUND_OWED_MS, backgroundOwedMs + sinceLastMs)
  backgroundClockAt = startedAt
  // Work at most half the gap, so a throttled timer still leaves the CPU half idle.
  const sliceMs = Math.min(MAX_BACKGROUND_SLICE_MS, Math.max(MIN_BACKGROUND_SLICE_MS, sinceLastMs / 2))
  while (backgroundOwedMs >= msPerTick() && performance.now() - startedAt < sliceMs) {
    running.tickN(1)
    backgroundOwedMs -= msPerTick()
  }
}

function tickOnce() {
  tickTimer = null
  if (simFailed) return
  const startedAt = performance.now()
  const running = manuallyPaused || hiddenPaused || reloadPreparing ? null : sim
  if (running && hiddenRunning) {
    owedTicks = 0
    clockAt = startedAt
    guarded(undefined, () => catchUpInBackground(running, startedAt))
    if (simFailed) return
    const workMs = performance.now() - startedAt
    const behind = backgroundOwedMs >= msPerTick()
    // Still behind: come straight back, idling at least as long as the slice took.
    const delay = behind ? Math.max(MIN_WASM_TICK_MS, workMs) : msPerTick() - backgroundOwedMs
    tickTimer = setTimeout(tickOnce, delay)
    return
  }
  backgroundOwedMs = 0
  backgroundClockAt = startedAt
  if (!running) {
    owedTicks = 0
    clockAt = startedAt
    tickTimer = setTimeout(tickOnce, Math.max(250, tickMs))
    return
  }
  const maxOwed = stepsPerEmit * MAX_CATCHUP_BATCHES
  owedTicks = Math.min(maxOwed, owedTicks + Math.max(0, startedAt - clockAt) / msPerTick())
  clockAt = startedAt
  let completed = 0
  while (
    owedTicks + TICK_EPSILON >= 1 &&
    completed < maxOwed &&
    (completed === 0 || performance.now() - startedAt < FAST_BATCH_MS)
  ) {
    guarded(undefined, () => running.tickN(1))
    if (simFailed) return
    completed += 1
    owedTicks -= 1
  }
  if (completed > 0) {
    if (tickMs >= WASM_BASE_TICK_MS || performance.now() - lastEmittedAt >= WASM_BASE_TICK_MS) {
      emit(performance.now() - lastDeepFullAt >= DEEP_FULL_EVERY_MS)
      if (simFailed) return
    }
  }
  const workMs = performance.now() - startedAt
  const untilNextBatchMs = Math.max(0, stepsPerEmit - owedTicks) * msPerTick()
  tickTimer = setTimeout(tickOnce, wasmTickDelay(untilNextBatchMs, workMs))
}

function startTickTimer() {
  if (tickTimer !== null) clearTimeout(tickTimer)
  owedTicks = 0
  clockAt = performance.now()
  tickTimer = setTimeout(tickOnce, Math.max(MIN_WASM_TICK_MS, tickMs))
}

function beginLoop(autosaveEveryMs: number) {
  stopTimers()
  if (!sim) return
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
  tickMs = Math.max(MIN_WASM_TICK_MS, msg.tickMs ?? tickMs)
  stepsPerEmit = Math.max(1, Math.floor(msg.stepsPerEmit ?? stepsPerEmit))
  autosaveEveryMs = msg.autosaveEveryMs ?? DEFAULT_AUTOSAVE_MS

  // Each startup phase is timed and sent with `ready`, so a slow start on a visitor's machine shows where it went.
  const startedAt = performance.now()
  const since = (from: number) => Math.round(performance.now() - from)
  let engine: SimEngine
  try {
    engine = await startSimEngine()
    Sim = engine.Sim
  } catch (e) {
    postError('engine_failed', 'wasm init failed', { error: e, fatal: true, phase: 'engine' })
    return
  }

  if (reloadPreparing) return
  const engineMs = since(startedAt)

  startupPhase = 'lock'
  const lockAt = performance.now()
  worldLockAcquired = await acquireWorldLock(worldId)
  const lockMs = since(lockAt)
  if (reloadPreparing) {
    await releaseLocalWorldLock()
    return
  }
  if (worldLockAcquired) {
    await removeMigrationLeftovers(worldStore, (key) => belongsToWorld(key)).catch((error: unknown) =>
      logger.warn('wasm', 'could not clear unfinished save copies:', error),
    )
    if (reloadPreparing) {
      await releaseLocalWorldLock()
      return
    }
  }
  if (!worldLockAcquired) {
    storageReady = false
    postError(
      'locked_elsewhere',
      'this local world is already open in another tab; this tab will not overwrite its save',
    )
  }

  startupPhase = 'restore'
  const restoreAt = performance.now()
  let restored = false
  let saved = null
  let resetApplied = false
  if (msg.reset && storageReady) {
    try {
      const recoveryId = await archiveAndDeleteWorld(worldId)
      if (reloadPreparing) return
      resetApplied = true
      post({ type: 'reset_done', recoveryId })
    } catch (e) {
      storageReady = false
      rememberRetry({ kind: 'reset', seed: msg.seed })
      postError('reset_failed', 'could not reset local save', { error: e, retryable: true })
    }
  }
  if (!resetApplied && msg.recoveryId && storageReady) {
    try {
      if (!msg.recoveryId.startsWith(recoveryPrefix(worldId))) throw new Error('invalid recovery save id')
      const recovery = await loadWorld(msg.recoveryId)
      if (reloadPreparing) return
      if (!recovery) throw new Error('recovery save no longer exists')
      if (recovery.blob.byteLength === 0) throw new Error('recovery save is empty')
      const recoveryPayload = await unpackSave(recovery.blob)
      if (reloadPreparing) return
      const candidate = Sim.fromSerialized(BigInt(recovery.seed), recoveryPayload)
      const recoveredTick = Number(candidate.tickCount())
      candidate.free()
      if (recoveredTick !== recovery.tick) {
        throw new Error(`recovery expected tick ${recovery.tick}, restored tick ${recoveredTick}`)
      }
      const previousBackupId = await restoreRecoveryWorld(worldId, msg.recoveryId)
      if (reloadPreparing) return
      saved = recovery
      post({
        type: 'recovery_done',
        recoveryId: msg.recoveryId,
        previousBackupId,
        tick: recovery.tick,
        seed: recovery.seed,
      })
    } catch (e) {
      storageReady = false
      rememberRetry({ kind: 'restore', recoveryId: msg.recoveryId })
      postError('recovery_restore_failed', 'recovery save could not be restored', {
        error: e,
        retryable: true,
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
    postError('read_failed', 'could not read local save', { error: e, retryable: worldLockAcquired })
  }
  if (reloadPreparing) return
  if (saved) {
    try {
      if (saved.blob.byteLength === 0) throw new Error('save is empty')
      const payload = await unpackSave(saved.blob)
      if (reloadPreparing) return
      sim = Sim.fromSerialized(BigInt(saved.seed), payload)
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
          postError('preserve_failed', 'local save recovery copy failed; original preserved', {
            error: recoveryError,
            retryable: true,
          })
        }
      }
      postError(
        recoverySaved ? 'restore_failed_kept' : 'restore_failed',
        `local save could not be restored${recoverySaved ? '; recovery copy kept' : ''}`,
        { error: e, retryable: storageReady || storageRetry !== null },
      )
      sim = null
    }
  }
  if (reloadPreparing) return
  const restoreMs = since(restoreAt)
  startupPhase = 'generate'
  const generateAt = performance.now()
  if (!sim) {
    sim = new Sim(BigInt(seed))
  }
  const startup: WorkerStartup = {
    engine: engine.fallback === null ? 'threads' : 'single',
    threads: engine.threads,
    fallback: engine.fallback,
    engine_ms: engineMs,
    lock_ms: lockMs,
    restore_ms: restoreMs,
    generate_ms: since(generateAt),
    total_ms: since(startedAt),
  }
  logger.info('wasm', 'world started', startup)

  startupPhase = 'ready'
  post({ type: 'ready', restored, tick: Number(sim.tickCount()), persistenceReady: storageReady, startup })

  emit(true)
  beginLoop(autosaveEveryMs)
  // Establish a known-good durable record immediately, including for a
  // brand-new world that is reloaded before the first autosave interval.
  void persist()
  if (worldLockAcquired) scheduleRecoveryMigration()
}

self.onmessage = (e: MessageEvent) => {
  const msg = e.data as InMsg
  switch (msg.type) {
    case 'start':
      // Only the first start() runs (`started` guards the rest); don't let a
      // duplicate message replace the promise a pending reload waits on.
      if (!startup) {
        startupRunning = true
        startup = start(msg)
          .catch((error: unknown) => {
            stopTimers()
            postError('startup_failed', 'the world could not start', {
              error,
              fatal: true,
              phase: startupPhase,
            })
          })
          .finally(() => {
            startupRunning = false
          })
      }
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
          speed,
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
          speed,
        })
      }
      break
    case 'visibility': {
      const wasHiddenRunning = hiddenRunning
      hiddenPaused = msg.hidden && msg.keepRunning !== true
      hiddenRunning = msg.hidden && msg.keepRunning === true
      // Frames held back while hidden (even if the setting is turned off before return) need a resync.
      if (hiddenRunning) resyncOnReturn = true
      if (wasHiddenRunning && !msg.hidden && sim && !manuallyPaused && !reloadPreparing) {
        // A throttled timer may not have fired since the last catch-up: run what is owed up
        // to now (within one slice) so the resync frame shows the world on time.
        const running = sim
        guarded(undefined, () => catchUpInBackground(running, performance.now()))
      }
      if (resyncOnReturn && !msg.hidden) {
        resyncOnReturn = false
        emit(true)
      }
      break
    }
    case 'save':
      void persist(true).then((ok) => {
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
      // During unreadable-save recovery, `sim` may be assigned while startup is
      // still preserving the original. Do not checkpoint that candidate.
      if (!sim || !worldLockAcquired || startupRunning) {
        if (msg.requireLocalWorld) {
          post({ type: 'reload_result', requestId: msg.requestId, ok: false })
          break
        }
        reloadPreparing = true
        stopTimers()
        void releaseWorldLockAfterStartup().then(() => {
          post({ type: 'reload_result', requestId: msg.requestId, ok: true })
          self.close()
        })
        break
      }
      // Freeze ticks before serializing. Previously the world kept advancing
      // while IndexedDB committed an older snapshot, then freed the newer
      // in-memory state, losing every tick in between on reload.
      reloadPreparing = true
      void runReloadCheckpoint(msg.deadlineAt, {
        quiesce: stopTimers,
        persist: () => persist(true),
        resume: () => {
          reloadPreparing = false
          if (sim) beginLoop(autosaveEveryMs)
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
    case 'command': {
      const running = sim
      const expired = msg.deadlineAt !== undefined && Date.now() > msg.deadlineAt
      if (running && !reloadPreparing && !expired) {
        const json = guarded(null, () => String(running.command(msg.json)))
        const outcome = (json === null ? null : parseCommandOutcome(json)) ?? FAILED_OUTCOME
        if (outcome.applied) {
          requestFullFrame()
          schedulePersistAfterCommand()
        }
        post({ type: 'command_result', requestId: msg.requestId, ok: outcome.applied, outcome })
      } else {
        post({ type: 'command_result', requestId: msg.requestId, ok: false, outcome: FAILED_OUTCOME })
      }
      break
    }
    case 'full_frame':
      requestFullFrame()
      break
    case 'org_detail': {
      const running = sim
      post({
        type: 'org_detail_result',
        requestId: msg.requestId,
        json: running ? guarded('', () => running.orgDetail(msg.id)) : '',
      })
      break
    }
    case 'org_life': {
      const running = sim
      post({
        type: 'org_life_result',
        requestId: msg.requestId,
        json: running ? guarded('', () => running.orgLife(msg.id)) : '',
      })
      break
    }
    case 'speed':
      {
        const valid =
          sim !== null &&
          Number.isFinite(msg.tickMs) &&
          msg.tickMs > 0 &&
          Number.isFinite(msg.stepsPerEmit) &&
          Number.isInteger(msg.stepsPerEmit) &&
          msg.stepsPerEmit >= 1 &&
          Number.isFinite(msg.speed) &&
          msg.speed >= MIN_RUNTIME_SPEED &&
          msg.speed <= MAX_RUNTIME_SPEED
        if (valid) {
          tickMs = Math.max(MIN_WASM_TICK_MS, msg.tickMs)
          stepsPerEmit = msg.stepsPerEmit
          speed = msg.speed
          if (tickTimer !== null) startTickTimer()
        }
        if (msg.requestId !== undefined) {
          post({
            type: 'runtime_result',
            requestId: msg.requestId,
            ok: valid,
            paused: manuallyPaused,
            tickMs,
            speed,
          })
        }
      }
      break
    case 'stop':
      stopTimers()
      void persist(true).finally(async () => {
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
