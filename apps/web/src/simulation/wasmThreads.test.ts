import { describe, expect, it } from 'vitest'
import { MAX_SIM_THREADS, threadCount, withTimeout, wantsThreads } from './wasmThreads'

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
