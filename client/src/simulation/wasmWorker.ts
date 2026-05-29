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
}
type InMsg =
  | StartMsg
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'save' }
  | { type: 'reset' }
  | { type: 'stop' }
  | { type: 'command'; json: string }
  | { type: 'speed'; tickMs: number }

const DEEP_FULL_EVERY_TICKS = 300n

let sim: Sim | null = null
let worldId = 'browser-own'
let seed = '0'
let tickMs = 120
let stepsPerEmit = 1
let frameId = 0
let started = false
let paused = false
let tickTimer: ReturnType<typeof setInterval> | null = null
let saveTimer: ReturnType<typeof setInterval> | null = null

function post(msg: unknown) {
  ;(self as unknown as Worker).postMessage(msg)
}

function emit(deepFull: boolean) {
  if (!sim) return
  frameId += 1
  const now = Date.now()
  const frame = deepFull ? sim.fullFrame(frameId, now) : sim.deltaFrame(frameId, now)
  post({ type: 'frame', frame })
}

async function persist() {
  if (!sim) return
  try {
    const blob = sim.serialize()
    const tick = Number(sim.tickCount())
    await saveWorld(worldId, { blob, seed, tick, savedAt: Date.now() })
    post({ type: 'saved', tick, savedAt: Date.now() })
  } catch (e) {
    post({ type: 'error', message: `autosave failed: ${e instanceof Error ? e.message : String(e)}` })
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
  if (paused || !sim) return
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
    if (!paused) void persist()
  }, autosaveEveryMs)
}

async function start(msg: StartMsg) {
  if (started) return
  started = true
  worldId = msg.id
  seed = msg.seed
  tickMs = msg.tickMs ?? tickMs
  stepsPerEmit = msg.stepsPerEmit ?? stepsPerEmit
  const autosaveEveryMs = msg.autosaveEveryMs ?? 30_000

  try {
    await init({ module_or_path: wasmUrl })
  } catch (e) {
    post({ type: 'error', message: `wasm init failed: ${e instanceof Error ? e.message : String(e)}` })
    return
  }

  let restored = false
  const saved = await loadWorld(worldId)
  if (saved) {
    try {
      sim = Sim.fromSerialized(BigInt(saved.seed), saved.blob)
      seed = saved.seed
      restored = true
    } catch {
      sim = null
    }
  }
  if (!sim) {
    sim = new Sim(BigInt(seed))
  }

  post({ type: 'ready', restored, tick: Number(sim.tickCount()) })

  emit(true)
  beginLoop(autosaveEveryMs)
}

self.onmessage = (e: MessageEvent) => {
  const msg = e.data as InMsg
  switch (msg.type) {
    case 'start':
      void start(msg)
      break
    case 'pause':
      paused = true
      break
    case 'resume':
      paused = false
      break
    case 'save':
      void persist()
      break
    case 'command':
      if (sim) {
        sim.command(msg.json)
        emit(true)
      }
      break
    case 'speed':
      tickMs = Math.max(16, msg.tickMs)
      if (tickTimer !== null) startTickTimer()
      break
    case 'reset':
      stopTimers()
      void (async () => {
        await deleteWorld(worldId)
        if (sim) {
          sim.free()
          sim = null
        }
        sim = new Sim(BigInt(seed))
        frameId = 0
        paused = false
        post({ type: 'ready', restored: false, tick: 0 })
        emit(true)
        beginLoop(30_000)
      })()
      break
    case 'stop':
      stopTimers()
      void persist().finally(() => {
        if (sim) {
          sim.free()
          sim = null
        }
      })
      break
  }
}
