import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  LOCAL_WORLD_RELOAD_EVENT,
  type LocalWorldReloadDetail,
  reloadAppSafely,
  requestOwnWorldRecovery,
  requestOwnWorldReset,
  resolvePlayerWorldKind,
  resolveWorldSource,
  setWorldSourceAndReload,
  shouldCheckpointSourceSwitch,
  shouldShowIdleResume,
  shouldUseSimulationApi,
} from './worldSource'

afterEach(() => {
  vi.unstubAllGlobals()
})

function memoryStorage(initial: Record<string, string> = {}, failWrites = false): Storage {
  const values = new Map(Object.entries(initial))
  return {
    get length() {
      return values.size
    },
    clear: vi.fn(() => {
      if (failWrites) throw new Error('storage disabled')
      values.clear()
    }),
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    key: vi.fn((index: number) => [...values.keys()][index] ?? null),
    removeItem: vi.fn((key: string) => {
      if (failWrites) throw new Error('storage disabled')
      values.delete(key)
    }),
    setItem: vi.fn((key: string, value: string) => {
      if (failWrites) throw new Error('storage disabled')
      values.set(key, value)
    }),
  }
}

function installReloadWindow(storage: Storage = memoryStorage()) {
  const target = new EventTarget() as EventTarget & {
    location: { reload: ReturnType<typeof vi.fn> }
    alert: ReturnType<typeof vi.fn>
    localStorage: Storage
    thbDesktop?: undefined
  }
  target.location = { reload: vi.fn() }
  target.alert = vi.fn()
  target.localStorage = storage
  vi.stubGlobal('window', target)
  return target
}

describe('resolveWorldSource', () => {
  it('starts the standalone web app in a private local world', () => {
    expect(resolveWorldSource(null, false)).toBe('wasm')
  })

  it('lets the desktop renderer use its native simulation mode', () => {
    expect(resolveWorldSource(null, true)).toBe('remote')
  })

  it('preserves an explicit player choice', () => {
    expect(resolveWorldSource('remote', false)).toBe('remote')
    expect(resolveWorldSource('wasm', true)).toBe('wasm')
  })
})

describe('resolvePlayerWorldKind', () => {
  it('identifies browser-owned and fallback simulations as local', () => {
    expect(resolvePlayerWorldKind('wasm', { desktop: false, localServer: false })).toBe('local')
    expect(
      resolvePlayerWorldKind('remote', {
        desktop: false,
        localServer: false,
        fellBackToLocal: true,
      }),
    ).toBe('local')
  })

  it('keeps an explicitly selected browser remote world shared even on localhost', () => {
    expect(resolvePlayerWorldKind('remote', { desktop: false, localServer: true })).toBe('shared')
  })

  it('uses the resolved desktop setting as the authoritative identity', () => {
    expect(
      resolvePlayerWorldKind('remote', {
        desktop: true,
        desktopMode: 'local',
        localServer: true,
      }),
    ).toBe('local')
    expect(
      resolvePlayerWorldKind('remote', {
        desktop: true,
        desktopMode: 'remote',
        localServer: true,
      }),
    ).toBe('shared')
  })

  it('uses the endpoint only while desktop settings are still loading', () => {
    expect(
      resolvePlayerWorldKind('remote', {
        desktop: true,
        desktopMode: null,
        localServer: true,
      }),
    ).toBe('local')
    expect(
      resolvePlayerWorldKind('remote', {
        desktop: true,
        desktopMode: null,
        localServer: false,
      }),
    ).toBe('shared')
  })
})

describe('shouldShowIdleResume', () => {
  it('never interrupts a local game for inactivity', () => {
    expect(shouldShowIdleResume(true, true)).toBe(false)
  })

  it('still lets the hosted world park idle connections', () => {
    expect(shouldShowIdleResume(true, false)).toBe(true)
  })
})

describe('shouldUseSimulationApi', () => {
  it('keeps a standalone local web world disconnected from the simulation API', () => {
    expect(shouldUseSimulationApi('wasm')).toBe(false)
  })

  it('uses the API for an explicitly selected shared web world', () => {
    expect(shouldUseSimulationApi('remote')).toBe(true)
  })

  it('allows desktop to reach its native simulation', () => {
    expect(shouldUseSimulationApi('remote')).toBe(true)
  })

  it('keeps an explicitly selected desktop WASM world on its own data source', () => {
    expect(shouldUseSimulationApi('wasm')).toBe(false)
  })
})

describe('shouldCheckpointSourceSwitch', () => {
  it('checkpoints and releases a browser world before going online', () => {
    expect(shouldCheckpointSourceSwitch('wasm', 'remote')).toBe(true)
  })

  it('does not add a checkpoint reload to other source transitions', () => {
    expect(shouldCheckpointSourceSwitch('remote', 'wasm')).toBe(false)
    expect(shouldCheckpointSourceSwitch('remote', 'remote')).toBe(false)
  })
})

describe('reloadAppSafely', () => {
  it('lets an active local worker checkpoint before any app reload', () => {
    const target = installReloadWindow()
    const details: LocalWorldReloadDetail[] = []
    target.addEventListener(LOCAL_WORLD_RELOAD_EVENT, (event) => {
      details.push((event as CustomEvent<LocalWorldReloadDetail>).detail)
      event.preventDefault()
    })

    expect(reloadAppSafely()).toBe(true)
    expect(target.location.reload).not.toHaveBeenCalled()
    expect(details[0]?.operation).toBe('reload')
  })

  it('reloads remote/native pages immediately when no local worker owns the event', () => {
    const target = installReloadWindow()

    expect(reloadAppSafely()).toBe(true)
    expect(target.location.reload).toHaveBeenCalledOnce()
  })

  it('blocks a destructive local operation when its worker is not ready', () => {
    const target = installReloadWindow()
    const onFailure = vi.fn()

    expect(
      reloadAppSafely({
        operation: 'reset',
        requireLocalWorld: true,
        onFailure,
        unavailableMessage: 'wait for local world',
      }),
    ).toBe(false)
    expect(target.location.reload).not.toHaveBeenCalled()
    expect(onFailure).toHaveBeenCalledOnce()
    expect(target.alert).toHaveBeenCalledWith('wait for local world')
  })
})

describe('local-world storage transitions', () => {
  it('restores the seed and prior recovery intent when reset cannot checkpoint', () => {
    const storage = memoryStorage({
      'thb-wasm-seed': '12345',
      'thb-wasm-recovery-pending': 'browser-own:recovery:older',
    })
    const target = installReloadWindow(storage)

    expect(requestOwnWorldReset()).toBe(false)
    expect(storage.getItem('thb-wasm-seed')).toBe('12345')
    expect(storage.getItem('thb-wasm-reset-pending')).toBeNull()
    expect(storage.getItem('thb-wasm-recovery-pending')).toBe('browser-own:recovery:older')
    expect(target.location.reload).not.toHaveBeenCalled()
  })

  it('restores a pending reset when recovery cannot checkpoint', () => {
    const storage = memoryStorage({ 'thb-wasm-reset-pending': '1' })
    installReloadWindow(storage)

    expect(requestOwnWorldRecovery('browser-own:recovery:123')).toBe(false)
    expect(storage.getItem('thb-wasm-reset-pending')).toBe('1')
    expect(storage.getItem('thb-wasm-recovery-pending')).toBeNull()
  })

  it('does not reload when the selected play mode could not be persisted', () => {
    const storage = memoryStorage({ 'thb-world-source': 'wasm' }, true)
    const target = installReloadWindow(storage)

    expect(setWorldSourceAndReload('remote')).toBe(false)
    expect(storage.getItem('thb-world-source')).toBe('wasm')
    expect(target.location.reload).not.toHaveBeenCalled()
    expect(target.alert).toHaveBeenCalledOnce()
  })
})
