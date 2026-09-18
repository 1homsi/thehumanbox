import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const model = vi.hoisted(() => ({ tick: 0n, tickN: vi.fn(), deltaFrame: vi.fn(), fullFrame: vi.fn() }))
vi.mock('../wasm/sim-core/sim_core.js', () => ({
  default: async () => {},
  Sim: class {
    tickN(n: number) {
      model.tickN(n)
      model.tick += BigInt(n)
    }
    tickCount() {
      return model.tick
    }
    deltaFrame() {
      model.deltaFrame()
      return '{}'
    }
    fullFrame() {
      model.fullFrame()
      return '{}'
    }
    command() {
      return true
    }
    serialize() {
      return new Uint8Array([1])
    }
    free() {}
  },
}))
vi.mock('./wasmDb', () => ({
  loadWorld: async () => null,
  saveWorld: async () => {},
  archiveAndDeleteWorld: vi.fn(),
  listRecoveryWorlds: vi.fn(),
  recoveryPrefix: vi.fn(),
  restoreRecoveryWorld: vi.fn(),
}))

let worker: {
  onmessage: ((event: { data: unknown }) => void) | null
  postMessage: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
}
const send = (data: unknown) => worker.onmessage?.({ data })

beforeEach(async () => {
  vi.resetModules()
  vi.useFakeTimers()
  vi.clearAllMocks()
  model.tick = 0n
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
