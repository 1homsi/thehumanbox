import init, { Sim } from '../wasm/sim-core/sim_core.js'
import wasmUrl from '../wasm/sim-core/sim_core_bg.wasm?url'
import { loadWorld, saveWorld, deleteWorld } from './wasmDb'

type StartMsg = {
  type: 'start'
  id: string
  seed: string
  tickMs?: number
  stepsPerEmit?: number
  autosaveEveryMs?: number
  reset?: boolean
}
type InMsg =
  | StartMsg
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'visibility'; hidden: boolean }
  | { type: 'save'; requestId?: number }
  | { type: 'stop' }
  | { type: 'command'; json: string; requestId: number }
  | { type: 'org_detail'; id: string; requestId: number }
  | { type: 'org_life'; id: string; requestId: number }
  | { type: 'speed'; tickMs: number }

const DEEP_FULL_EVERY_TICKS = 300n
// Full world saves can be tens of megabytes. Commands and shutdowns
// checkpoint immediately; this slower cadence covers passive play without
// repeatedly stalling the simulation worker on JSON serialization.
const DEFAULT_AUTOSAVE_MS = 30_000

let sim: Sim | null = null
let worldId = 'browser-own'
let seed = '0'
let tickMs = 120
let stepsPerEmit = 1
let frameId = 0
let started = false
let manuallyPaused = false
let hiddenPaused = false
let tickTimer: ReturnType<typeof setInterval> | null = null
let saveTimer: ReturnType<typeof setInterval> | null = null
let persistInFlight: Promise<boolean> | null = null
let persistAgain = false
let storageReady = true
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

function releaseLocalWorldLock() {
  releaseWorldLock?.()
  releaseWorldLock = null
}

function emit(deepFull: boolean) {
  if (!sim) return
  frameId += 1
  const now = Date.now()
  const frame = deepFull ? sim.fullFrame(frameId, now) : sim.deltaFrame(frameId, now)
  post({ type: 'frame', frame })
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
      post({ type: 'error', message: `autosave failed: ${e instanceof Error ? e.message : String(e)}` })
      return false
    }
  })()

  try {
    return await persistInFlight
  } finally {
    persistInFlight = null
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
  if (manuallyPaused || hiddenPaused || !sim) return
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
  const autosaveEveryMs = msg.autosaveEveryMs ?? DEFAULT_AUTOSAVE_MS

  try {
    await init({ module_or_path: wasmUrl })
  } catch (e) {
    post({ type: 'error', message: `wasm init failed: ${e instanceof Error ? e.message : String(e)}` })
    return
  }

  const ownsWorldLock = await acquireWorldLock(worldId)
  if (!ownsWorldLock) {
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
      await deleteWorld(worldId)
      resetApplied = true
      post({ type: 'reset_done' })
    } catch (e) {
      storageReady = false
      post({
        type: 'error',
        message: `could not reset local save: ${e instanceof Error ? e.message : String(e)}`,
      })
    }
  }
  try {
    if (!resetApplied) saved = await loadWorld(worldId)
  } catch (e) {
    // A read failure is not proof that no save exists. Keep the new world
    // playable, but never overwrite the primary record in this session.
    storageReady = false
    post({
      type: 'error',
      message: `could not read local save: ${e instanceof Error ? e.message : String(e)}`,
    })
  }
  if (saved) {
    try {
      if (saved.blob.byteLength === 0) throw new Error('save is empty')
      sim = Sim.fromSerialized(BigInt(saved.seed), saved.blob)
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
      if (storageReady) {
        try {
          await saveWorld(`${worldId}:recovery:${saved.savedAt}`, saved)
          recoverySaved = true
        } catch (recoveryError) {
          // Never replace the only copy of an unreadable save. The fresh world
          // remains playable for this session, but writes stay disabled until
          // the player frees storage or explicitly resets the old world.
          storageReady = false
          post({
            type: 'error',
            message: `local save recovery copy failed; original preserved: ${
              recoveryError instanceof Error ? recoveryError.message : String(recoveryError)
            }`,
          })
        }
      }
      post({
        type: 'error',
        message: `local save could not be restored${recoverySaved ? '; recovery copy kept' : ''}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      })
      sim = null
    }
  }
  if (!sim) {
    sim = new Sim(BigInt(seed))
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
      manuallyPaused = true
      break
    case 'resume':
      manuallyPaused = false
      break
    case 'visibility':
      hiddenPaused = msg.hidden
      break
    case 'save':
      void persist().then((ok) => {
        if (msg.requestId !== undefined) post({ type: 'save_result', requestId: msg.requestId, ok })
      })
      break
    case 'command':
      if (sim) {
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
      tickMs = Math.max(16, msg.tickMs)
      if (tickTimer !== null) startTickTimer()
      break
    case 'stop':
      stopTimers()
      void persist().finally(() => {
        if (sim) {
          sim.free()
          sim = null
        }
        releaseLocalWorldLock()
        post({ type: 'stopped' })
        self.close()
      })
      break
  }
}
