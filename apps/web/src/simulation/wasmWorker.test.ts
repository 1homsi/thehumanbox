import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const model = vi.hoisted(() => ({
  init: vi.fn(async () => {}),
  tick: 0n,
  tickN: vi.fn(),
  deltaFrame: vi.fn(),
  fullFrame: vi.fn(),
  fromSerialized: vi.fn(),
  loadWorld: vi.fn(
    async (): Promise<{ blob: Uint8Array; seed: string; tick: number; savedAt: number } | null> => null,
  ),
  serialize: vi.fn(() => new Uint8Array([1])),
  saveWorld: vi.fn(async () => {}),
  archiveAndDeleteWorld: vi.fn(async () => 'recovery-1'),
  restoreRecoveryWorld: vi.fn(async () => 'previous-1'),
  listRecoveryWorlds: vi.fn(async () => [] as { id: string }[]),
  recoveryPrefix: vi.fn((worldId: string) => `recovery:${worldId}:`),
}))
vi.mock('../wasm/sim-core/sim_core.js', () => ({
  default: model.init,
  Sim: class {
    static fromSerialized() {
      return model.fromSerialized()
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
      return true
    }
    serialize() {
      return model.serialize()
    }
    free() {}
  },
}))
vi.mock('./wasmDb', () => ({
  loadWorld: model.loadWorld,
  saveWorld: model.saveWorld,
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
  model.serialize.mockClear()
  model.saveWorld.mockClear()
  model.archiveAndDeleteWorld.mockReset().mockResolvedValue('recovery-1')
  model.restoreRecoveryWorld.mockReset().mockResolvedValue('previous-1')
  model.listRecoveryWorlds.mockReset().mockResolvedValue([])
  model.recoveryPrefix.mockReset().mockImplementation((worldId: string) => `recovery:${worldId}:`)
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
    expect(worker.postMessage).toHaveBeenCalledWith(
      { type: 'frame', frame: new Uint8Array([0x80]) },
      [expect.any(ArrayBuffer)],
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
    // Restart timing from a known frame timestamp.
    send({ type: 'command', json: '{}', requestId: 4 })
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

  it('yields after an expensive tick instead of running the rest of a fast batch', async () => {
    let clock = 0
    vi.spyOn(performance, 'now').mockImplementation(() => clock)
    model.tickN.mockImplementation(() => {
      clock += 80
    })
    send({ type: 'speed', tickMs: 24, stepsPerEmit: 10, speed: 50 })
    await vi.advanceTimersByTimeAsync(24)
    expect(model.tick).toBe(1n)
    await vi.advanceTimersByTimeAsync(79)
    expect(model.tick).toBe(1n)
    await vi.advanceTimersByTimeAsync(1)
    expect(model.tick).toBe(2n)
  })
})
