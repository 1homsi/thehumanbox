import { afterEach, describe, expect, it, vi } from 'vitest'
import { recoveryPrefix } from './wasmDb'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('recoveryPrefix', () => {
  it('names recovery saves under their world without colliding with the primary key', () => {
    expect(recoveryPrefix('browser-own')).toBe('browser-own:recovery:')
    expect('browser-own:recovery:123'.startsWith(recoveryPrefix('browser-own'))).toBe(true)
    expect('another:recovery:123'.startsWith(recoveryPrefix('browser-own'))).toBe(false)
  })
})

describe('IndexedDB connection lifecycle', () => {
  it('closes a late connection after a blocked open was already rejected', async () => {
    vi.resetModules()
    const close = vi.fn()
    const request = {
      result: null as unknown as IDBDatabase,
      error: null,
      onupgradeneeded: null,
      onsuccess: null,
      onerror: null,
      onblocked: null,
    } as unknown as IDBOpenDBRequest
    vi.stubGlobal('indexedDB', { open: vi.fn(() => request) })

    const { loadWorld } = await import('./wasmDb')
    const loading = loadWorld('browser-own')
    request.onblocked?.(new Event('blocked') as IDBVersionChangeEvent)

    await expect(loading).rejects.toThrow('indexedDB open blocked by another tab')

    Object.defineProperty(request, 'result', { value: { close }, configurable: true })
    request.onsuccess?.(new Event('success'))
    expect(close).toHaveBeenCalledOnce()
  })
})
