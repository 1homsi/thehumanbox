import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  LOCAL_WORLD_RELOAD_EVENT,
  type LocalWorldReloadDetail,
  reloadAppSafely,
  resolvePlayerWorldKind,
  resolveWorldSource,
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
    expect(resolveWorldSource(null, true)).toBe('native')
  })

  it('ignores legacy source preferences', () => {
    expect(resolveWorldSource('native', false)).toBe('wasm')
    expect(resolveWorldSource('wasm', true)).toBe('native')
  })
})

describe('resolvePlayerWorldKind', () => {
  it('identifies browser-owned and fallback simulations as local', () => {
    expect(resolvePlayerWorldKind('wasm', { desktop: false, localServer: false })).toBe('local')
    expect(
      resolvePlayerWorldKind('native', {
        desktop: false,
        localServer: false,
        fellBackToLocal: true,
      }),
    ).toBe('local')
  })

  it('identifies the desktop native simulation as local', () => {
    expect(
      resolvePlayerWorldKind('native', {
        desktop: true,
        desktopMode: 'local',
        localServer: true,
      }),
    ).toBe('local')
    expect(resolvePlayerWorldKind('native', { desktop: true, localServer: false })).toBe('local')
  })
})

describe('shouldUseSimulationApi', () => {
  it('keeps a standalone local web world disconnected from the simulation API', () => {
    expect(shouldUseSimulationApi('wasm')).toBe(false)
  })

  it('allows desktop to reach its native simulation', () => {
    expect(shouldUseSimulationApi('native')).toBe(true)
  })

  it('keeps an explicitly selected desktop WASM world on its own data source', () => {
    expect(shouldUseSimulationApi('wasm')).toBe(false)
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
