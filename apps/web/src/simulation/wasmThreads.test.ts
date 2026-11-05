import { describe, expect, it, vi } from 'vitest'
import { MAX_SIM_THREADS, raceEngines, threadCount, withTimeout, wantsThreads } from './wasmThreads'

describe('wantsThreads', () => {
  it('needs a cross-origin isolated page with SharedArrayBuffer', () => {
    expect(wantsThreads({ crossOriginIsolated: true, SharedArrayBuffer: function () {} })).toBe(true)
  })

  it('keeps every page that is not isolated on the single-thread engine', () => {
    expect(wantsThreads({ crossOriginIsolated: false, SharedArrayBuffer: function () {} })).toBe(false)
    expect(wantsThreads({ SharedArrayBuffer: function () {} })).toBe(false)
  })

  it('keeps a browser without SharedArrayBuffer on the single-thread engine', () => {
    expect(wantsThreads({ crossOriginIsolated: true, SharedArrayBuffer: undefined })).toBe(false)
  })
})

describe('withTimeout', () => {
  it('passes through a start that finishes in time', async () => {
    await expect(withTimeout(Promise.resolve(7), 1000)).resolves.toBe(7)
  })

  it('rejects a start that never settles, so the worker can fall back', async () => {
    await expect(withTimeout(new Promise<never>(() => {}), 5)).rejects.toThrow('not started after 5 ms')
  })

  it('keeps a failure of the start as it was', async () => {
    await expect(withTimeout(Promise.reject(new Error('no worker')), 1000)).rejects.toThrow('no worker')
  })
})

describe('threadCount', () => {
  it('leaves one core for the page', () => {
    expect(threadCount(4)).toBe(3)
    expect(threadCount(3)).toBe(2)
  })

  it('never takes more than the cap, however many cores the machine has', () => {
    expect(threadCount(16)).toBe(MAX_SIM_THREADS)
    expect(threadCount(64)).toBe(MAX_SIM_THREADS)
  })

  it('runs at least one thread', () => {
    expect(threadCount(1)).toBe(1)
    expect(threadCount(2)).toBe(1)
    expect(threadCount(0)).toBe(1)
  })

  it('runs one thread when the core count is unknown', () => {
    expect(threadCount(undefined)).toBe(1)
    expect(threadCount(Number.NaN)).toBe(1)
  })
})

describe('raceEngines', () => {
  /** A sleep the test releases by hand, so the head start ends exactly when the test says. */
  function manualSleep() {
    let wake = () => {}
    const sleep = () => new Promise<void>((resolve) => (wake = resolve))
    return { sleep, wake: () => wake() }
  }
  const never = <T>() => new Promise<T>(() => {})

  it('runs the threaded engine and never starts the single one when threads are ready in time', async () => {
    const startSingle = vi.fn(async () => 'single')
    const { sleep } = manualSleep()
    await expect(raceEngines(Promise.resolve('threads'), startSingle, 3000, sleep)).resolves.toEqual({
      engine: 'threads',
      fallback: null,
    })
    expect(startSingle).not.toHaveBeenCalled()
  })

  it('starts the single engine at once when the threaded start fails', async () => {
    const { sleep } = manualSleep()
    await expect(
      raceEngines(Promise.reject(new Error('no pool')), async () => 'single', 3000, sleep),
    ).resolves.toEqual({ engine: 'single', fallback: 'failed' })
  })

  it('a stalled threaded start costs the head start, not the 40 s of timeouts', async () => {
    const clock = manualSleep()
    const startSingle = vi.fn(async () => 'single')
    const choice = raceEngines(never<string>(), startSingle, 3000, clock.sleep)
    await Promise.resolve()
    expect(startSingle).not.toHaveBeenCalled()
    clock.wake()
    await expect(choice).resolves.toEqual({ engine: 'single', fallback: 'slow' })
    expect(startSingle).toHaveBeenCalledOnce()
  })

  it('keeps the threaded engine when it finishes first after the single one started', async () => {
    const clock = manualSleep()
    let readyThreads: (engine: string) => void = () => {}
    const threaded = new Promise<string>((resolve) => (readyThreads = resolve))
    const choice = raceEngines(threaded, () => never<string>(), 3000, clock.sleep)
    clock.wake()
    await Promise.resolve()
    readyThreads('threads')
    await expect(choice).resolves.toEqual({ engine: 'threads', fallback: null })
  })

  it('waits for the threaded engine when the single one fails, and fails only if both do', async () => {
    const clock = manualSleep()
    let failThreads: (error: Error) => void = () => {}
    const threaded = new Promise<string>((_resolve, reject) => (failThreads = reject))
    const choice = raceEngines(
      threaded,
      async () => Promise.reject(new Error('single broke')),
      3000,
      clock.sleep,
    )
    clock.wake()
    await Promise.resolve()
    failThreads(new Error('threads broke'))
    await expect(choice).rejects.toThrow(/broke/)
  })
})
