import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  LOCAL_WORLD_RELOAD_EVENT,
  type LocalWorldReloadDetail,
  reloadAppSafely,
  resolvePlayerWorldKind,
  resolveWorldSource,
  shouldCheckpointSourceSwitch,
  shouldShowIdleResume,
  shouldUseSimulationApi,
} from './worldSource'

afterEach(() => {
  vi.unstubAllGlobals()
})

function installReloadWindow() {
  const target = new EventTarget() as EventTarget & {
    location: { reload: ReturnType<typeof vi.fn> }
    alert: ReturnType<typeof vi.fn>
  }
  target.location = { reload: vi.fn() }
  target.alert = vi.fn()
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
