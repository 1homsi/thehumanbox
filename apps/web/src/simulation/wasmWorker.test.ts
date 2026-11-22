import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { wasmSpeedConfig, type WasmSpeedConfig } from './runtimeControls'

const APPLIED_JSON = '{"applied":true,"code":"applied","count":0,"name":null}'
const model = vi.hoisted(() => ({
  init: vi.fn(async () => {}),
  tick: 0n,
  tickN: vi.fn(),
  deltaFrame: vi.fn(),
  fullFrame: vi.fn(),
  fromSerialized: vi.fn<(seed: bigint, bytes: Uint8Array) => unknown>(),
  loadWorld: vi.fn(
    async (): Promise<{ blob: Uint8Array; seed: string; tick: number; savedAt: number } | null> => null,
  ),
  serialize: vi.fn(() => new Uint8Array([1])),
  slicesLeft: 0,
  sliceBudgets: [] as number[],
  command: vi.fn(() => APPLIED_JSON),
  saveWorld: vi.fn<(id: string, world: unknown) => Promise<void>>(async () => {}),
  archiveAndDeleteWorld: vi.fn(async () => 'recovery-1'),
  restoreRecoveryWorld: vi.fn(async () => 'previous-1'),
  listRecoveryWorlds: vi.fn(async () => [] as { id: string }[]),
  recoveryPrefix: vi.fn((worldId: string) => `recovery:${worldId}:`),
  packSave: vi.fn<(payload: Uint8Array, options?: { signal?: AbortSignal }) => Promise<Uint8Array>>(
    async (payload) => Uint8Array.from([0x89, ...payload]),
  ),
  unpackSave: vi.fn(async (bytes: Uint8Array) => bytes),
  writeVerified: vi.fn<(store: unknown, id: string, world: unknown) => Promise<boolean>>(
    async (_store, id, world) => {
      await model.saveWorld(id, world)
      return true
    },
  ),
  migrateStoredWorlds: vi.fn<
    (store: unknown, include: (key: string) => boolean) => Promise<{ migrated: string[]; failed: string[] }>
  >(async () => ({ migrated: [], failed: [] })),
  removeMigrationLeftovers: vi.fn(async () => {}),
}))
vi.mock('../wasm/sim-core/scalar/sim_core_scalar.js', () => ({
  default: vi.fn(async () => {}),
  Sim: class {},
}))
vi.mock('../wasm/sim-core/sim_core.js', () => ({
  default: model.init,
  Sim: class {
    static fromSerialized(seed: bigint, bytes: Uint8Array) {
      return model.fromSerialized(seed, bytes)
    }
    tickN(n: number) {
      model.tickN(n)
      model.tick += BigInt(n)
    }
    tickCount() {
      return model.tick
    }
    deltaFrameBytes() {
      model.deltaFrame()
      return new Uint8Array([0x80])
    }
    fullFrameBytes() {
      model.fullFrame()
      return new Uint8Array([0x80])
    }
    command() {
      return model.command()
    }
    serialize() {
      return model.serialize()
    }
    pending: Uint8Array | null = null
    serializeBegin() {
      this.pending = model.serialize()
    }
    serializeChunk(budgetMs: number) {
      model.sliceBudgets.push(budgetMs)
      if (model.slicesLeft > 0) {
        model.slicesLeft -= 1
        return undefined
      }
      const blob = this.pending ?? new Uint8Array()
      this.pending = null
      return blob
    }
    free() {}
  },
}))
// The threaded engine is only started on a cross-origin isolated page, which these tests never are.
vi.mock('../wasm/sim-core-threads/sim_core_threads.js', () => ({
  default: vi.fn(async () => {}),
  initThreadPool: vi.fn(async () => {}),
  Sim: class {},
}))
vi.mock('./saveContainer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./saveContainer')>()),
  packSave: model.packSave,
  unpackSave: model.unpackSave,
}))
vi.mock('./saveMigration', () => ({
  writeVerified: model.writeVerified,
  migrateStoredWorlds: model.migrateStoredWorlds,
  removeMigrationLeftovers: model.removeMigrationLeftovers,
}))
vi.mock('./wasmDb', () => ({
  loadWorld: model.loadWorld,
  saveWorld: model.saveWorld,
  deleteWorld: vi.fn(async () => {}),
  moveWorld: vi.fn(async () => true),
  listWorldKeys: vi.fn(async () => [] as string[]),
  archiveAndDeleteWorld: model.archiveAndDeleteWorld,
  listRecoveryWorlds: model.listRecoveryWorlds,
  recoveryPrefix: model.recoveryPrefix,
  restoreRecoveryWorld: model.restoreRecoveryWorld,
}))

let worker: {
  onmessage: ((event: { data: unknown }) => void) | null
  postMessage: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
}
const send = (data: unknown) => worker.onmessage?.({ data })

/** A `navigator.locks` that grants the lock right away and reports when it is released. */
function heldLock() {
  const state = { released: false }
  const locks = {
    request: vi.fn(
      async (_name: string, _options: unknown, callback: (lock: object | null) => Promise<void>) => {
        await callback({})
        state.released = true
      },
    ),
  }
  return { locks, released: () => state.released }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

/** Clean up the worker from `beforeEach` and start a fresh one with a chosen navigator and world ops. */
async function restartWorker(navigator: object) {
  send({ type: 'stop' })
  await vi.advanceTimersByTimeAsync(0)
  await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalledWith({ type: 'stopped' }))
  // Drop the previous worker's call history so a `waitFor` on a world op only
  // matches the worker this test is about to start.
  vi.clearAllMocks()
  vi.stubGlobal('navigator', navigator)
  vi.resetModules()
  worker = { onmessage: null, postMessage: vi.fn(), close: vi.fn() }
  vi.stubGlobal('self', worker)
  await import('./wasmWorker')
}

beforeEach(async () => {
  vi.resetModules()
  vi.useFakeTimers()
  vi.clearAllMocks()
  model.tick = 0n
  model.loadWorld.mockReset().mockResolvedValue(null)
  model.fromSerialized.mockReset()
  model.init.mockReset().mockResolvedValue(undefined)
  model.serialize.mockReset().mockImplementation(() => new Uint8Array([1]))
  model.slicesLeft = 0
  model.sliceBudgets = []
  model.fullFrame.mockReset()
  model.packSave
    .mockReset()
    .mockImplementation(async (payload: Uint8Array) => Uint8Array.from([0x89, ...payload]))
  model.unpackSave.mockReset().mockImplementation(async (bytes: Uint8Array) => bytes)
  model.saveWorld.mockClear()
  model.archiveAndDeleteWorld.mockReset().mockResolvedValue('recovery-1')
  model.restoreRecoveryWorld.mockReset().mockResolvedValue('previous-1')
  model.listRecoveryWorlds.mockReset().mockResolvedValue([])
  model.recoveryPrefix.mockReset().mockImplementation((worldId: string) => `recovery:${worldId}:`)
  model.command.mockReset().mockImplementation(() => APPLIED_JSON)
  vi.spyOn(performance, 'now').mockImplementation(() => Date.now())
  worker = { onmessage: null, postMessage: vi.fn(), close: vi.fn() }
  vi.stubGlobal('self', worker)
  vi.stubGlobal('navigator', {})
  await import('./wasmWorker')
  send({ type: 'start', id: 'test', seed: '42' })
  await vi.advanceTimersByTimeAsync(0)
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  model.tickN.mockReset()
})

describe('browser simulation scheduling', () => {
  it('transfers binary MessagePack frames from the worker', () => {
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'frame', frame: new Uint8Array([0x80]) }, [
      expect.any(ArrayBuffer),
    ])
  })

  it('sends a code and the raw detail with a save error, for the page to translate', async () => {
    model.saveWorld.mockRejectedValueOnce(new Error('QuotaExceededError'))
    send({ type: 'save', requestId: 30 })
    await vi.advanceTimersByTimeAsync(0)
    expect(worker.postMessage).toHaveBeenCalledWith({
      type: 'error',
      code: 'autosave_failed',
      detail: 'QuotaExceededError',
      message: 'autosave failed: QuotaExceededError',
      retryable: true,
    })
  })

  it('reports a startup that throws as a fatal error with the phase it reached', async () => {
    await restartWorker({
      locks: {
        request: () => {
          throw new Error('boom')
        },
      },
    })
    send({ type: 'start', id: 'test', seed: '42' })
    await vi.advanceTimersByTimeAsync(0)
    expect(worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        code: 'startup_failed',
        fatal: true,
        phase: 'lock',
        detail: 'boom',
      }),
    )
    expect(worker.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'ready' }))
  })

  it('reports an engine that cannot load in the engine phase', async () => {
    model.init.mockRejectedValueOnce(new Error('out of memory'))
    await restartWorker({})
    send({ type: 'start', id: 'test', seed: '42' })
    await vi.advanceTimersByTimeAsync(0)
    expect(worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error', code: 'engine_failed', fatal: true, phase: 'engine' }),
    )
  })

  it('accepts a safe reload while WASM is still booting', async () => {
    send({ type: 'stop' })
    await vi.advanceTimersByTimeAsync(0)
    await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalledWith({ type: 'stopped' }))
    let finishInit!: () => void
    model.init.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishInit = resolve
        }),
    )
    vi.resetModules()
    worker = { onmessage: null, postMessage: vi.fn(), close: vi.fn() }
    vi.stubGlobal('self', worker)
    await import('./wasmWorker')
    send({ type: 'start', id: 'test', seed: '42' })
    await Promise.resolve()
    send({ type: 'prepare_reload', requestId: 9, deadlineAt: Date.now() + 1000 })
    await vi.advanceTimersByTimeAsync(0)
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'reload_result', requestId: 9, ok: true })
    expect(worker.close).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
    finishInit()
    await vi.advanceTimersByTimeAsync(0)
    expect(worker.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'ready' }))
  })

  it('accepts a safe reload when another tab owns the world lock', async () => {
    send({ type: 'stop' })
    await vi.advanceTimersByTimeAsync(0)
    await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalledWith({ type: 'stopped' }))
    const locks = { request: vi.fn(async (_name, _options, callback) => callback(null)) }
    vi.stubGlobal('navigator', { locks })
    vi.resetModules()
    worker = { onmessage: null, postMessage: vi.fn(), close: vi.fn() }
    vi.stubGlobal('self', worker)
    await import('./wasmWorker')
    send({ type: 'start', id: 'test', seed: '42' })
    await vi.advanceTimersByTimeAsync(0)
    expect(worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ready', persistenceReady: false }),
    )
    model.saveWorld.mockClear()
    send({ type: 'prepare_reload', requestId: 10, deadlineAt: Date.now() + 1000 })
    await vi.advanceTimersByTimeAsync(0)
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'reload_result', requestId: 10, ok: true })
    expect(worker.close).toHaveBeenCalledOnce()
    expect(model.saveWorld).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('releases a world lock granted while reload is waiting for startup', async () => {
    send({ type: 'stop' })
    await vi.advanceTimersByTimeAsync(0)
    await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalledWith({ type: 'stopped' }))
    let grantLock!: (lock: object | null) => void
    let markReleased!: () => void
    const released = new Promise<void>((resolve) => {
      markReleased = resolve
    })
    const locks = {
      request: vi.fn(
        async (_name: string, _options: unknown, callback: (lock: object | null) => Promise<void>) => {
          const lock = await new Promise<object | null>((resolve) => {
            grantLock = resolve
          })
          await callback(lock)
          markReleased()
        },
      ),
    }
    vi.stubGlobal('navigator', { locks })
    vi.resetModules()
    worker = { onmessage: null, postMessage: vi.fn(), close: vi.fn() }
    vi.stubGlobal('self', worker)
    await import('./wasmWorker')
    send({ type: 'start', id: 'test', seed: '42' })
    await vi.waitFor(() => expect(locks.request).toHaveBeenCalledOnce())
    send({ type: 'prepare_reload', requestId: 13, deadlineAt: Date.now() + 1000 })
    await vi.advanceTimersByTimeAsync(0)
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'reload_result', requestId: 13, ok: true })
    grantLock({})
    await vi.advanceTimersByTimeAsync(0)
    await released
    expect(worker.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'ready' }))
  })

  it('refuses a reset reload without the world lock', async () => {
    send({ type: 'stop' })
    await vi.advanceTimersByTimeAsync(0)
    await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalledWith({ type: 'stopped' }))
    const locks = { request: vi.fn(async (_name, _options, callback) => callback(null)) }
    vi.stubGlobal('navigator', { locks })
    vi.resetModules()
    worker = { onmessage: null, postMessage: vi.fn(), close: vi.fn() }
    vi.stubGlobal('self', worker)
    await import('./wasmWorker')
    send({ type: 'start', id: 'test', seed: '42' })
    await vi.advanceTimersByTimeAsync(0)
    send({ type: 'prepare_reload', requestId: 11, deadlineAt: Date.now() + 1000, requireLocalWorld: true })
    await vi.advanceTimersByTimeAsync(0)
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'reload_result', requestId: 11, ok: false })
    expect(worker.close).not.toHaveBeenCalled()
  })

  it('does not finish startup after a reload during recovery preservation', async () => {
    send({ type: 'stop' })
    await vi.advanceTimersByTimeAsync(0)
    await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalledWith({ type: 'stopped' }))
    model.saveWorld.mockClear()
    let finishPreserve!: () => void
    model.loadWorld.mockResolvedValueOnce({
      blob: new Uint8Array([1]),
      seed: '42',
      tick: 0,
      savedAt: 1,
    })
    model.fromSerialized.mockImplementationOnce(() => {
      throw new Error('invalid saved world')
    })
    model.saveWorld.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishPreserve = resolve
        }),
    )
    vi.resetModules()
    worker = { onmessage: null, postMessage: vi.fn(), close: vi.fn() }
    vi.stubGlobal('self', worker)
    await import('./wasmWorker')
    send({ type: 'start', id: 'test', seed: '42' })
    await vi.waitFor(() => expect(model.saveWorld).toHaveBeenCalledOnce())
    send({ type: 'prepare_reload', requestId: 12, deadlineAt: Date.now() + 1000 })
    await vi.advanceTimersByTimeAsync(0)
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'reload_result', requestId: 12, ok: true })
    finishPreserve()
    await vi.advanceTimersByTimeAsync(0)
    expect(worker.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'ready' }))
    expect(model.saveWorld).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('holds the world lock until an in-flight reset transaction finishes', async () => {
    const lock = heldLock()
    const archive = deferred<string>()
    model.archiveAndDeleteWorld.mockImplementationOnce(() => archive.promise)
    await restartWorker({ locks: lock.locks })
    send({ type: 'start', id: 'test', seed: '42', reset: true })
    await vi.waitFor(() => expect(model.archiveAndDeleteWorld).toHaveBeenCalledOnce())

    send({ type: 'prepare_reload', requestId: 20, deadlineAt: Date.now() + 1000 })
    await vi.advanceTimersByTimeAsync(0)
    // The reset is still writing: the reload must not release the lock under it.
    expect(lock.released()).toBe(false)
    expect(worker.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'reload_result' }))

    archive.resolve('recovery-1')
    await vi.advanceTimersByTimeAsync(0)
    expect(lock.released()).toBe(true)
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'reload_result', requestId: 20, ok: true })
    expect(worker.close).toHaveBeenCalledOnce()
    expect(worker.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'ready' }))
  })

  it('holds the world lock until an in-flight recovery read finishes', async () => {
    const lock = heldLock()
    const read = deferred<{ blob: Uint8Array; seed: string; tick: number; savedAt: number } | null>()
    // The recovery read is the first world op start() makes.
    model.loadWorld.mockImplementationOnce(() => read.promise)
    await restartWorker({ locks: lock.locks })
    send({ type: 'start', id: 'test', seed: '42', recoveryId: 'recovery:test:rec-1' })
    await vi.waitFor(() => expect(model.loadWorld).toHaveBeenCalledWith('recovery:test:rec-1'))

    send({ type: 'prepare_reload', requestId: 21, deadlineAt: Date.now() + 1000 })
    await vi.advanceTimersByTimeAsync(0)
    expect(lock.released()).toBe(false)

    read.resolve(null)
    await vi.advanceTimersByTimeAsync(0)
    expect(lock.released()).toBe(true)
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'reload_result', requestId: 21, ok: true })
    expect(worker.close).toHaveBeenCalledOnce()
    expect(worker.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'ready' }))
  })

  it('holds the world lock until an in-flight recovery restore finishes', async () => {
    const lock = heldLock()
    const restore = deferred<string>()
    model.loadWorld.mockResolvedValue({ blob: new Uint8Array([2]), seed: '7', tick: 3, savedAt: 1 })
    model.fromSerialized.mockReturnValue({ tickCount: () => 3n, free: () => {} })
    model.restoreRecoveryWorld.mockImplementationOnce(() => restore.promise)
    await restartWorker({ locks: lock.locks })
    send({ type: 'start', id: 'test', seed: '42', recoveryId: 'recovery:test:rec-1' })
    await vi.waitFor(() => expect(model.restoreRecoveryWorld).toHaveBeenCalledOnce())

    send({ type: 'prepare_reload', requestId: 22, deadlineAt: Date.now() + 1000 })
    await vi.advanceTimersByTimeAsync(0)
    expect(lock.released()).toBe(false)

    restore.resolve('previous-1')
    await vi.advanceTimersByTimeAsync(0)
    expect(lock.released()).toBe(true)
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'reload_result', requestId: 22, ok: true })
    expect(worker.close).toHaveBeenCalledOnce()
    expect(worker.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'ready' }))
  })

  it('holds the world lock until an in-flight local save read finishes', async () => {
    const lock = heldLock()
    const read = deferred<{ blob: Uint8Array; seed: string; tick: number; savedAt: number } | null>()
    model.loadWorld.mockImplementation(() => read.promise)
    await restartWorker({ locks: lock.locks })
    send({ type: 'start', id: 'test', seed: '42' })
    await vi.waitFor(() => expect(model.loadWorld).toHaveBeenCalledWith('test'))

    send({ type: 'prepare_reload', requestId: 23, deadlineAt: Date.now() + 1000 })
    await vi.advanceTimersByTimeAsync(0)
    expect(lock.released()).toBe(false)

    read.resolve(null)
    await vi.advanceTimersByTimeAsync(0)
    expect(lock.released()).toBe(true)
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'reload_result', requestId: 23, ok: true })
    expect(worker.close).toHaveBeenCalledOnce()
    expect(worker.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'ready' }))
  })

  it('holds the world lock until an in-flight recovery copy of an unreadable save finishes', async () => {
    const lock = heldLock()
    await restartWorker({ locks: lock.locks })
    const preserve = deferred<void>()
    model.loadWorld.mockResolvedValueOnce({ blob: new Uint8Array([1]), seed: '42', tick: 5, savedAt: 1 })
    // A tick mismatch leaves the restored simulation assigned while the recovery copy is written.
    model.fromSerialized.mockReturnValueOnce({
      tickCount: () => 0n,
      serialize: () => new Uint8Array([1]),
      serializeBegin: () => {},
      serializeChunk: () => new Uint8Array([1]),
      free: () => {},
    })
    model.saveWorld.mockImplementationOnce(() => preserve.promise)
    send({ type: 'start', id: 'test', seed: '42' })
    await vi.waitFor(() => expect(model.saveWorld).toHaveBeenCalledOnce())

    send({ type: 'prepare_reload', requestId: 24, deadlineAt: Date.now() + 1000 })
    await vi.advanceTimersByTimeAsync(0)
    // The recovery copy is still writing: the reload must not release the lock under it.
    expect(lock.released()).toBe(false)
    expect(worker.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'reload_result' }))
    expect(model.saveWorld).toHaveBeenCalledOnce()

    preserve.resolve()
    await vi.advanceTimersByTimeAsync(0)
    expect(lock.released()).toBe(true)
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'reload_result', requestId: 24, ok: true })
    expect(worker.close).toHaveBeenCalledOnce()
    expect(worker.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'ready' }))
  })

  it('autosaves every five minutes instead of serializing on the old 30-second cadence', async () => {
    // Startup writes a baseline save immediately; isolate the periodic timer.
    model.serialize.mockClear()
    model.saveWorld.mockClear()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(model.serialize).not.toHaveBeenCalled()
    expect(model.saveWorld).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(4 * 60_000 + 30_000)
    expect(model.serialize).toHaveBeenCalledTimes(1)
    expect(model.saveWorld).toHaveBeenCalledTimes(1)
  })

  it('writes an autosave a slice at a time, letting the world tick between slices', async () => {
    model.serialize.mockClear()
    model.saveWorld.mockClear()
    model.sliceBudgets = []
    model.slicesLeft = 3
    await vi.advanceTimersByTimeAsync(5 * 60_000 + 1_000)
    expect(model.serialize).toHaveBeenCalledTimes(1)
    expect(model.sliceBudgets).toEqual([8, 8, 8, 8])
    expect(model.saveWorld).toHaveBeenCalledTimes(1)
    expect(model.saveWorld.mock.calls[0][1]).toMatchObject({ blob: Uint8Array.from([0x89, 1]) })
  })

  it('drops a save that is being sliced and saves the world at once when the page needs it now', async () => {
    model.serialize.mockClear()
    model.saveWorld.mockClear()
    model.sliceBudgets = []
    model.slicesLeft = 1_000_000
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(model.sliceBudgets.length).toBeGreaterThan(0)
    send({ type: 'stop' })
    await vi.advanceTimersByTimeAsync(0)
    await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalledWith({ type: 'stopped' }))
    expect(model.serialize).toHaveBeenCalledTimes(2)
    expect(model.saveWorld).toHaveBeenCalledTimes(1)
    expect(model.saveWorld).toHaveBeenCalledWith(
      'test',
      expect.objectContaining({ blob: Uint8Array.from([1]) }),
    )
  })

  it('fast-forward advances ticks without flooding the renderer with frames', async () => {
    send({ type: 'speed', tickMs: 24, stepsPerEmit: 10, speed: 50 })
    await vi.advanceTimersByTimeAsync(1200)
    expect(model.tick).toBe(500n)
    expect(model.deltaFrame.mock.calls.length + model.fullFrame.mock.calls.length).toBeLessThanOrEqual(12)
    // Fast-forward must not multiply expensive full-terrain snapshots.
    expect(model.fullFrame).toHaveBeenCalledTimes(1)
  })

  it('refreshes cold world data by wall time even at 50x', async () => {
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now())
    send({ type: 'command', json: '{}', requestId: 4 })
    await vi.advanceTimersByTimeAsync(250)
    model.fullFrame.mockClear()
    send({ type: 'speed', tickMs: 24, stepsPerEmit: 10, speed: 50 })
    await vi.advanceTimersByTimeAsync(35_000)
    expect(model.tick).toBeGreaterThan(10_000n)
    expect(model.fullFrame).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1_200)
    expect(model.fullFrame).toHaveBeenCalledTimes(1)
  })

  it('pause and visibility stop ticks; resuming does not replay missed time', async () => {
    await vi.advanceTimersByTimeAsync(240)
    const before = model.tick
    send({ type: 'pause', requestId: 1 })
    await vi.advanceTimersByTimeAsync(2000)
    expect(model.tick).toBe(before)
    expect(worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'runtime_result', requestId: 1, paused: true }),
    )
    send({ type: 'resume' })
    send({ type: 'visibility', hidden: true })
    await vi.advanceTimersByTimeAsync(2000)
    expect(model.tick).toBe(before)
    send({ type: 'visibility', hidden: false })
    await vi.advanceTimersByTimeAsync(250)
    expect(model.tick - before).toBeLessThanOrEqual(3n)
    expect(model.tick).toBeGreaterThan(before)
  })

  it('keeps ticking while hidden when asked to, without sending frames, then resyncs', async () => {
    await vi.advanceTimersByTimeAsync(240)
    const before = model.tick
    send({ type: 'visibility', hidden: true, keepRunning: true })
    model.deltaFrame.mockClear()
    model.fullFrame.mockClear()
    await vi.advanceTimersByTimeAsync(2400)
    expect(model.tick - before).toBeGreaterThanOrEqual(15n)
    expect(model.deltaFrame).not.toHaveBeenCalled()
    expect(model.fullFrame).not.toHaveBeenCalled()
    send({ type: 'visibility', hidden: false, keepRunning: true })
    expect(model.fullFrame).toHaveBeenCalledTimes(1)
  })

  it('a world started in a hidden tab stays paused until the tab is shown', async () => {
    send({ type: 'stop' })
    await vi.advanceTimersByTimeAsync(0)
    vi.resetModules()
    model.tick = 0n
    worker = { onmessage: null, postMessage: vi.fn(), close: vi.fn() }
    vi.stubGlobal('self', worker)
    await import('./wasmWorker')
    send({ type: 'visibility', hidden: true, keepRunning: false })
    send({ type: 'start', id: 'test', seed: '42' })
    await vi.advanceTimersByTimeAsync(2000)
    expect(model.tick).toBe(0n)
    send({ type: 'visibility', hidden: false, keepRunning: false })
    await vi.advanceTimersByTimeAsync(500)
    expect(model.tick).toBeGreaterThan(0n)
  })

  it('keeps real time while hidden even when the browser throttles its timers', async () => {
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now())
    await vi.advanceTimersByTimeAsync(240)
    send({ type: 'visibility', hidden: true, keepRunning: true })
    // A throttled background tab: no timer fires sooner than a second.
    const fakeSetTimeout = globalThis.setTimeout
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, ms?: number) =>
      fakeSetTimeout(fn, Math.max(1000, ms ?? 0))) as typeof setTimeout)
    const before = model.tick
    await vi.advanceTimersByTimeAsync(10_000)
    // 10 s at 120 ms per tick is ~83 ticks, not the ~10 the late timers alone would give.
    expect(model.tick - before).toBeGreaterThanOrEqual(75n)
    expect(model.tick - before).toBeLessThanOrEqual(86n)
  })

  it('runs the time a late timer still owed before resyncing a returning tab', async () => {
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now())
    await vi.advanceTimersByTimeAsync(240)
    send({ type: 'visibility', hidden: true, keepRunning: true })
    const fakeSetTimeout = globalThis.setTimeout
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, ms?: number) =>
      fakeSetTimeout(fn, Math.max(1000, ms ?? 0))) as typeof setTimeout)
    const before = model.tick
    // Shown 900 ms after the last throttled wake-up, before the next one fires.
    await vi.advanceTimersByTimeAsync(3_900)
    model.fullFrame.mockClear()
    send({ type: 'visibility', hidden: false, keepRunning: true })
    expect(model.tick - before).toBeGreaterThanOrEqual(31n)
    expect(model.fullFrame).toHaveBeenCalledTimes(1)
  })

  it('resyncs on return even if the setting was turned off while hidden', async () => {
    send({ type: 'visibility', hidden: true, keepRunning: true })
    await vi.advanceTimersByTimeAsync(1000)
    send({ type: 'visibility', hidden: true, keepRunning: false })
    await vi.advanceTimersByTimeAsync(1000)
    model.fullFrame.mockClear()
    send({ type: 'visibility', hidden: false, keepRunning: false })
    expect(model.fullFrame).toHaveBeenCalledTimes(1)
  })

  it('sends the command outcome back with its result', async () => {
    send({ type: 'command', json: '{}', requestId: 8 })
    await vi.advanceTimersByTimeAsync(10)
    expect(worker.postMessage).toHaveBeenCalledWith({
      type: 'command_result',
      requestId: 8,
      ok: true,
      outcome: { applied: true, code: 'applied', count: 0, name: null },
    })
  })

  it('sends no frames for commands while hidden and running', async () => {
    send({ type: 'visibility', hidden: true, keepRunning: true })
    model.deltaFrame.mockClear()
    model.fullFrame.mockClear()
    send({ type: 'command', json: '{}', requestId: 7 })
    await vi.advanceTimersByTimeAsync(500)
    expect(model.fullFrame).not.toHaveBeenCalled()
    expect(model.deltaFrame).not.toHaveBeenCalled()
  })

  it('does not replay more than a minute after the machine sleeps', async () => {
    let clock = 0
    vi.spyOn(performance, 'now').mockImplementation(() => clock)
    await vi.advanceTimersByTimeAsync(240)
    send({ type: 'visibility', hidden: true, keepRunning: true })
    const before = model.tick
    clock += 60 * 60_000
    await vi.advanceTimersByTimeAsync(5_000)
    expect(model.tick - before).toBeLessThanOrEqual(BigInt(Math.ceil(65_000 / 120)))
  })

  it('yields after an expensive tick instead of running the rest of a fast batch', async () => {
    let work = 0
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now() + work)
    model.tickN.mockImplementation(() => {
      work += 80
    })
    send({ type: 'speed', tickMs: 24, stepsPerEmit: 10, speed: 50 })
    await vi.advanceTimersByTimeAsync(24)
    expect(model.tick).toBe(1n)
    await vi.advanceTimersByTimeAsync(3)
    expect(model.tick).toBe(1n)
    await vi.advanceTimersByTimeAsync(1)
    expect(model.tick).toBe(2n)
  })

  async function achievedSpeed(tickCostMs: number, config: WasmSpeedConfig, wallMs: number) {
    let work = 0
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now() + work)
    model.tickN.mockImplementation(() => {
      work += tickCostMs
    })
    send({ type: 'speed', ...config })
    await vi.advanceTimersByTimeAsync(0)
    const startTick = model.tick
    const startedAt = performance.now()
    while (performance.now() - startedAt < wallMs) await vi.advanceTimersByTimeAsync(1)
    return (Number(model.tick - startTick) * 120) / (performance.now() - startedAt)
  }

  it('runs a world whose ticks cost almost a whole tick at no less than normal speed', async () => {
    const config = wasmSpeedConfig(1)
    expect(config).not.toBeNull()
    expect(await achievedSpeed(100, config!, 12_000)).toBeGreaterThanOrEqual(0.99)
  })

  it('runs a world that cannot keep up at its maximum at the top speed, not below normal speed', async () => {
    const config = wasmSpeedConfig(5000)
    expect(config).not.toBeNull()
    const achieved = await achievedSpeed(100, config!, 12_000)
    expect(achieved).toBeGreaterThanOrEqual(1.1)
    expect(achieved).toBeLessThanOrEqual(1.2)
  })

  it('keeps simulating most of the time at the top speed when ticks are cheap', async () => {
    const config = wasmSpeedConfig(5000)
    expect(config).not.toBeNull()
    expect(await achievedSpeed(2, config!, 6_000)).toBeGreaterThanOrEqual(50)
  })

  it('spaces command saves by what the last save cost, so a big world is not saved after every click', async () => {
    let work = 0
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now() + work)
    model.serialize.mockImplementation(() => {
      work += 1_000
      return new Uint8Array([1])
    })
    send({ type: 'save', requestId: 1 })
    await vi.advanceTimersByTimeAsync(0)
    model.saveWorld.mockClear()
    send({ type: 'command', json: '{}', requestId: 2 })
    await vi.advanceTimersByTimeAsync(1_600)
    expect(model.saveWorld).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(17_000)
    expect(model.saveWorld).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(model.saveWorld).toHaveBeenCalledTimes(1)
    send({ type: 'command', json: '{}', requestId: 3 })
    await vi.advanceTimersByTimeAsync(1_600)
    await vi.advanceTimersByTimeAsync(17_000)
    expect(model.saveWorld).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(model.saveWorld).toHaveBeenCalledTimes(2)
  })

  const lastSavedBlob = () => (model.saveWorld.mock.calls.at(-1)?.[1] as { blob: Uint8Array }).blob

  it('compresses an autosave but writes a requested save as it is, at once', async () => {
    model.serialize.mockImplementation(() => new Uint8Array([7, 8]))
    model.saveWorld.mockClear()
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(model.packSave).toHaveBeenCalled()
    expect([...lastSavedBlob()]).toEqual([0x89, 7, 8])
    model.packSave.mockClear()
    send({ type: 'save', requestId: 3 })
    await vi.advanceTimersByTimeAsync(0)
    expect(model.packSave).not.toHaveBeenCalled()
    expect([...lastSavedBlob()]).toEqual([7, 8])
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'save_result', requestId: 3, ok: true })
  })

  it('drops a compression in progress when the page asks for a save, and saves at once', async () => {
    let signal: AbortSignal | undefined
    model.packSave.mockImplementation(
      (_payload: Uint8Array, options?: { signal?: AbortSignal }) =>
        new Promise<Uint8Array>((_resolve, reject) => {
          signal = options?.signal
          signal?.addEventListener('abort', () => reject(new Error('cancelled')))
        }),
    )
    model.saveWorld.mockClear()
    send({ type: 'command', json: '{}', requestId: 4 })
    await vi.advanceTimersByTimeAsync(1_600)
    expect(signal).toBeDefined()
    expect(model.saveWorld).not.toHaveBeenCalled()
    send({ type: 'save', requestId: 5 })
    await vi.advanceTimersByTimeAsync(0)
    expect(signal?.aborted).toBe(true)
    expect(model.saveWorld).toHaveBeenCalledTimes(1)
    expect([...lastSavedBlob()]).toEqual([1])
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'save_result', requestId: 5, ok: true })
  })

  it('saves uncompressed when compression fails, so the world is never left unsaved', async () => {
    model.packSave.mockRejectedValue(new Error('no compression here'))
    model.saveWorld.mockClear()
    send({ type: 'command', json: '{}', requestId: 6 })
    await vi.advanceTimersByTimeAsync(1_600)
    expect(model.saveWorld).toHaveBeenCalledTimes(1)
    expect([...lastSavedBlob()]).toEqual([1])
    expect(worker.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ code: 'autosave_failed' }))
  })

  it('checks the first compressed save of a session by reading it back, then writes directly', async () => {
    expect(model.writeVerified).toHaveBeenCalledTimes(1)
    model.writeVerified.mockClear()
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(model.writeVerified).not.toHaveBeenCalled()
    expect([...lastSavedBlob()]).toEqual([0x89, 1])
  })

  it('hands the simulation the unpacked save, whichever format it was stored in', async () => {
    const stored = Uint8Array.from([0x89, 0x54, 0x48, 0x42, 1, 1, 9])
    const payload = new TextEncoder().encode('{"version":7}')
    model.loadWorld.mockResolvedValue({ blob: stored, seed: '7', tick: 3, savedAt: 1 })
    model.unpackSave.mockImplementation(async (bytes: Uint8Array) => (bytes === stored ? payload : bytes))
    model.fromSerialized.mockReturnValue({
      tickCount: () => 3n,
      free: () => {},
      deltaFrameBytes: () => new Uint8Array([0x80]),
      fullFrameBytes: () => new Uint8Array([0x80]),
      serialize: () => payload,
      serializeBegin: () => {},
      serializeChunk: () => payload,
      tickN: () => {},
    })
    await restartWorker({})
    send({ type: 'start', id: 'test', seed: '42' })
    await vi.waitFor(() => expect(model.fromSerialized).toHaveBeenCalled())
    expect(model.unpackSave).toHaveBeenCalledWith(stored)
    expect(model.fromSerialized).toHaveBeenCalledWith(7n, payload)
  })

  it('compresses old recovery saves in the background some time after the world starts', async () => {
    expect(model.removeMigrationLeftovers).toHaveBeenCalled()
    expect(model.migrateStoredWorlds).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(20_000)
    expect(model.migrateStoredWorlds).toHaveBeenCalledTimes(1)
    const include = model.migrateStoredWorlds.mock.calls[0][1]
    expect(include('recovery:test:123')).toBe(true)
    expect(include('test')).toBe(false)
  })

  it('spaces full frames for commands by what the last one cost', async () => {
    let work = 0
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now() + work)
    send({ type: 'pause' })
    model.fullFrame.mockImplementation(() => {
      work += 200
    })
    await vi.advanceTimersByTimeAsync(1_000)
    model.fullFrame.mockClear()
    send({ type: 'full_frame' })
    expect(model.fullFrame).toHaveBeenCalledTimes(1)
    model.fullFrame.mockClear()
    send({ type: 'command', json: '{}', requestId: 9 })
    await vi.advanceTimersByTimeAsync(1_000)
    expect(model.fullFrame).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(model.fullFrame).toHaveBeenCalledTimes(1)
  })

  it('keeps the requested rate when timers fire late, without replaying a backlog', async () => {
    const fakeSetTimeout = globalThis.setTimeout
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, ms?: number) =>
      fakeSetTimeout(fn, (ms ?? 0) + 30)) as typeof setTimeout)
    send({ type: 'speed', tickMs: 120, stepsPerEmit: 1, speed: 1 })
    const before = model.tick
    await vi.advanceTimersByTimeAsync(12_000)
    expect(model.tick - before).toBeGreaterThanOrEqual(97n)
    expect(model.tick - before).toBeLessThanOrEqual(101n)
  })

  it('caps catch-up after a long stall to two batches', async () => {
    let stall = 0
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now() + stall)
    send({ type: 'speed', tickMs: 120, stepsPerEmit: 1, speed: 1 })
    await vi.advanceTimersByTimeAsync(240)
    const before = model.tick
    stall = 10_000
    await vi.advanceTimersByTimeAsync(130)
    expect(model.tick - before).toBeLessThanOrEqual(3n)
  })

  it('answers a burst of commands with a few full frames and one save', async () => {
    await vi.advanceTimersByTimeAsync(300)
    model.fullFrame.mockClear()
    model.saveWorld.mockClear()
    for (let i = 0; i < 40; i += 1) {
      send({ type: 'command', json: '{}', requestId: 100 + i })
      await vi.advanceTimersByTimeAsync(50)
    }
    expect(worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'command_result', requestId: 139, ok: true }),
    )
    expect(model.fullFrame.mock.calls.length).toBeLessThanOrEqual(9)
    expect(model.saveWorld).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1_500)
    expect(model.saveWorld).toHaveBeenCalledTimes(1)
  })

  it('still saves a command when the world stops before the debounce', async () => {
    model.saveWorld.mockClear()
    send({ type: 'command', json: '{}', requestId: 5 })
    send({ type: 'stop' })
    await vi.advanceTimersByTimeAsync(0)
    await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalledWith({ type: 'stopped' }))
    expect(model.saveWorld).toHaveBeenCalledTimes(1)
  })

  it('drops a command that arrives after the page gave up on it', async () => {
    send({ type: 'command', json: '{}', requestId: 6, deadlineAt: Date.now() - 1 })
    expect(model.command).not.toHaveBeenCalled()
    expect(worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'command_result', requestId: 6, ok: false }),
    )
    send({ type: 'command', json: '{}', requestId: 7, deadlineAt: Date.now() + 4_500 })
    expect(model.command).toHaveBeenCalledOnce()
  })

  it('sends a fresh full frame on request, even while paused', async () => {
    send({ type: 'pause' })
    await vi.advanceTimersByTimeAsync(1_000)
    model.fullFrame.mockClear()
    send({ type: 'full_frame' })
    expect(model.fullFrame).toHaveBeenCalledOnce()
  })

  it('stops calling into a simulation that panicked and reports the panic once', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    await restartWorker({})
    send({ type: 'start', id: 'test', seed: '42' })
    await vi.advanceTimersByTimeAsync(0)
    model.tickN.mockImplementation(() => {
      globalThis.console.error('panicked at crates/sim-core/src/sim/tick.rs:10:5:\nindex out of bounds')
      throw new Error('unreachable')
    })
    await vi.advanceTimersByTimeAsync(500)
    const fatal = worker.postMessage.mock.calls
      .map(([msg]) => msg as { type?: string; fatal?: boolean; message?: string; code?: string })
      .filter((msg) => msg.type === 'error' && msg.fatal)
    expect(fatal).toHaveLength(1)
    expect(fatal[0].code).toBe('sim_crashed')
    expect(fatal[0].message).toContain('index out of bounds')
    expect(model.tickN).toHaveBeenCalledOnce()
    send({ type: 'command', json: '{}', requestId: 9 })
    expect(model.command).not.toHaveBeenCalled()
    expect(worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'command_result', requestId: 9, ok: false }),
    )
    await vi.advanceTimersByTimeAsync(5_000)
    expect(model.tickN).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
    consoleError.mockRestore()
  })

  it('answers a command that throws and reports the crash', async () => {
    model.command.mockImplementation(() => {
      throw new Error('recursive use of an object detected which would lead to unsafe aliasing in rust')
    })
    send({ type: 'command', json: '{}', requestId: 10 })
    expect(worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'command_result', requestId: 10, ok: false }),
    )
    expect(worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error', fatal: true, code: 'sim_crashed' }),
    )
  })
})
