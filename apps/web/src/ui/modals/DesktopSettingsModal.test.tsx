// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { DesktopSettingsModal } from './DesktopSettingsModal'
import type { DesktopBridge, DesktopSettings } from '../../shared/desktop'

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())
const roots: Array<{ unmount: () => void }> = []
afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()))
  delete window.thbDesktop
  document.body.innerHTML = ''
})

const SETTINGS: DesktopSettings = {
  mode: 'local',
  tickMs: 100,
  populationCap: 1000,
  saveLocationOverride: null,
  autoUpdate: true,
  autoLaunch: false,
  startMinimized: false,
  pauseWhenHidden: true,
}

function bridge(overrides: {
  get?: () => Promise<unknown>
  set?: () => Promise<unknown>
  status?: () => Promise<unknown>
  restart?: () => Promise<unknown>
  applyAutoLaunch?: () => Promise<unknown>
}): DesktopBridge {
  return {
    isDesktop: true,
    platform: 'darwin',
    appVersion: '1.0.0',
    settings: {
      get: overrides.get ?? (() => Promise.resolve(SETTINGS)),
      set: overrides.set ?? (() => Promise.resolve(SETTINGS)),
    },
    sim: {
      status: overrides.status ?? (() => Promise.resolve({ running: true, port: 1 })),
      restart: overrides.restart ?? (() => Promise.resolve({ running: true, port: 1 })),
    },
    app: { applyAutoLaunch: overrides.applyAutoLaunch ?? (() => Promise.resolve()) },
    world: {},
    on: () => () => {},
  } as unknown as DesktopBridge
}

async function mount(b: DesktopBridge) {
  window.thbDesktop = b
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  roots.push(root)
  await act(async () => {
    root.render(<DesktopSettingsModal onClose={() => {}} />)
  })
  const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
  const button = (label: string) =>
    [...document.querySelectorAll('button')].find((el) => el.textContent?.trim() === label) as HTMLButtonElement
  const openSimulationTab = async () => {
    await act(async () => {
      button('simulation')?.click()
    })
  }
  return { root, flush, button, openSimulationTab }
}

describe('DesktopSettingsModal failures', () => {
  it('shows an error and a retry instead of "loading…" forever when settings cannot be read', async () => {
    let attempt = 0
    const m = await mount(
      bridge({
        get: () => (++attempt === 1 ? Promise.reject(new Error('disk gone')) : Promise.resolve(SETTINGS)),
      }),
    )
    await m.openSimulationTab()
    await m.flush()
    expect(document.body.textContent).toContain('could not load settings: disk gone')
    expect(document.body.textContent).not.toContain('loading…')
    await act(async () => {
      m.button('retry').click()
    })
    await m.flush()
    expect(document.body.textContent).not.toContain('could not load settings')
    expect(document.body.textContent).toContain('save settings')
  })

  it('reports a rejected save instead of dropping it', async () => {
    const m = await mount(bridge({ set: () => Promise.reject(new Error('read-only file')) }))
    await m.openSimulationTab()
    await m.flush()
    await act(async () => {
      m.button('save settings').click()
    })
    await m.flush()
    expect(document.body.textContent).toContain('could not save settings: read-only file')
    expect(m.button('save settings').disabled).toBe(false)
    expect(document.body.textContent).not.toContain('saved,')
  })

  it('says the settings were saved when only the login-item update fails', async () => {
    const m = await mount(bridge({ applyAutoLaunch: () => Promise.reject(new Error('no permission')) }))
    await m.openSimulationTab()
    await m.flush()
    await act(async () => {
      m.button('save settings').click()
    })
    await m.flush()
    expect(document.body.textContent).toContain('saved, but could not update launch at login: no permission')
    expect(document.body.textContent).not.toContain('could not save settings')
  })

  it('reports a failed restart and re-reads the simulation status', async () => {
    const status = vi.fn(() => Promise.resolve({ running: false, port: null }))
    const m = await mount(bridge({ restart: () => Promise.reject(new Error('port busy')), status }))
    await m.openSimulationTab()
    await m.flush()
    await act(async () => {
      m.button('apply + restart').click()
    })
    await m.flush()
    expect(document.body.textContent).toContain('could not restart the simulation: port busy')
    expect(status).toHaveBeenCalledTimes(2)
    expect(document.body.textContent).toContain('Not running.')
  })
})
