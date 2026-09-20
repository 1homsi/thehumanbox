import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { reloadAppSafely } from '../simulation/worldSource'
import { loadWithChunkRecovery } from './lazyWithRetry'
vi.mock('../simulation/worldSource', () => ({ reloadAppSafely: vi.fn() }))
beforeEach(() => {
  const storage = new Map<string, string>()
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
    removeItem: (k: string) => storage.delete(k),
  })
  vi.mocked(reloadAppSafely).mockReset()
})
afterEach(() => vi.unstubAllGlobals())
const failure = new Error('Failed to fetch dynamically imported module')
it('rejects when a later checkpoint failure cancels the reload', async () => {
  let cancel: (() => void) | undefined
  vi.mocked(reloadAppSafely).mockImplementation((options) => {
    cancel = options?.onFailure
    return true
  })
  const result = loadWithChunkRecovery(() => Promise.reject(failure))
  const rejected = expect(result).rejects.toBe(failure)
  await Promise.resolve()
  expect(cancel).toBeTypeOf('function')
  cancel!()
  await rejected
  expect(sessionStorage.getItem('thb-chunk-reload-at')).toBeNull()
})
it('also settles if failure is reported synchronously', async () => {
  vi.mocked(reloadAppSafely).mockImplementation((options) => {
    options?.onFailure?.()
    return false
  })
  await expect(loadWithChunkRecovery(() => Promise.reject(failure))).rejects.toBe(failure)
})
it('does not reload ordinary failures or import successes', async () => {
  const ordinary = new Error('module initialization failed')
  await expect(loadWithChunkRecovery(() => Promise.reject(ordinary))).rejects.toBe(ordinary)
  await expect(loadWithChunkRecovery(() => Promise.resolve('ready'))).resolves.toBe('ready')
  expect(reloadAppSafely).not.toHaveBeenCalled()
})
it('rejects instead of hanging when reload is in cooldown', async () => {
  sessionStorage.setItem('thb-chunk-reload-at', String(Date.now()))
  await expect(loadWithChunkRecovery(() => Promise.reject(failure))).rejects.toBe(failure)
  expect(reloadAppSafely).not.toHaveBeenCalled()
})

it('rejects when the reload request is declined without a callback', async () => {
  vi.mocked(reloadAppSafely).mockReturnValue(false)
  await expect(loadWithChunkRecovery(() => Promise.reject(failure))).rejects.toBe(failure)
})
it('settles a cancelled reload even if clearing browser storage fails', async () => {
  let cancel: (() => void) | undefined
  vi.mocked(reloadAppSafely).mockImplementation((options) => {
    cancel = options?.onFailure
    return true
  })
  const result = loadWithChunkRecovery(() => Promise.reject(failure))
  const rejected = expect(result).rejects.toBe(failure)
  await Promise.resolve()
  vi.spyOn(sessionStorage, 'removeItem').mockImplementation(() => {
    throw new Error('storage denied')
  })
  expect(() => cancel!()).not.toThrow()
  await rejected
})
