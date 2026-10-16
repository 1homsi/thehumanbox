// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { DesktopSettingsModal } from './DesktopSettingsModal'
import type { DesktopBridge, DesktopSettings } from '../../shared/desktop'
import { settleConfirm } from '../../shared/confirm'

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
  checkForUpdates?: () => Promise<unknown>
  pickSaveDir?: () => Promise<unknown>
  screenshot?: () => Promise<unknown>
  openWorlds?: () => Promise<unknown>
  openLogs?: () => Promise<unknown>
  migrateDataRoot?: () => Promise<unknown>
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
    app: {
      applyAutoLaunch: overrides.applyAutoLaunch ?? (() => Promise.resolve()),
      checkForUpdates: overrides.checkForUpdates ?? (() => Promise.resolve({ status: 'up-to-date' })),
      pickSaveDir: overrides.pickSaveDir ?? (() => Promise.resolve(null)),
      screenshot: overrides.screenshot ?? (() => Promise.resolve(null)),
      openWorlds: overrides.openWorlds ?? (() => Promise.resolve()),
      openLogs: overrides.openLogs ?? (() => Promise.resolve()),
    },
    world: {
      migrateDataRoot:
        overrides.migrateDataRoot ?? (() => Promise.resolve({ settings: SETTINGS, migrated: false })),
    },
    on: () => () => {},
  } as unknown as DesktopBridge
}

async function mount(b: DesktopBridge, onSimulationRestart?: () => Promise<void>) {
  window.thbDesktop = b
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  roots.push(root)
  await act(async () => {
    root.render(<DesktopSettingsModal onClose={() => {}} onSimulationRestart={onSimulationRestart} />)
  })
  const flush = () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  const button = (label: string) =>
    [...document.querySelectorAll('button')].find(
      (el) => el.textContent?.trim() === label,
    ) as HTMLButtonElement
  const openSimulationTab = async () => {
    await act(async () => {
      button('simulation')?.click()
    })
  }
  const openAppTab = async () => {
    await act(async () => {
      button('app')?.click()
    })
  }
  return { root, flush, button, openSimulationTab, openAppTab }
}

describe('DesktopSettingsModal failures', () => {
  it('refreshes runtime state after a successful simulation restart', async () => {
    const refreshRuntime = vi.fn(() => Promise.resolve())
    const m = await mount(bridge({}), refreshRuntime)
    await m.openSimulationTab()
    await m.flush()
    await act(async () => {
      m.button('apply + restart').click()
    })
    await m.flush()
    expect(refreshRuntime).toHaveBeenCalledOnce()
  })

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

  it('blames the save, not the restart, when the settings cannot be written before restarting', async () => {
    const restart = vi.fn(() => Promise.resolve({ running: true, port: 1 }))
    const m = await mount(bridge({ set: () => Promise.reject(new Error('read-only file')), restart }))
    await m.openSimulationTab()
    await m.flush()
    await act(async () => {
      m.button('apply + restart').click()
    })
    await m.flush()
    expect(document.body.textContent).toContain('could not save settings: read-only file')
    expect(document.body.textContent).not.toContain('could not restart the simulation')
    expect(restart).not.toHaveBeenCalled()
  })

  it('clears the error on the next attempt', async () => {
    let attempt = 0
    const m = await mount(
      bridge({
        set: () =>
          ++attempt === 1 ? Promise.reject(new Error('read-only file')) : Promise.resolve(SETTINGS),
      }),
    )
    await m.openSimulationTab()
    await m.flush()
    await act(async () => {
      m.button('save settings').click()
    })
    await m.flush()
    expect(document.body.textContent).toContain('could not save settings: read-only file')
    await act(async () => {
      m.button('save settings').click()
    })
    await m.flush()
    expect(document.body.textContent).not.toContain('could not save settings')
  })

  it('reports a failed update check instead of sitting on "checking..."', async () => {
    const m = await mount(bridge({ checkForUpdates: () => Promise.reject(new Error('offline')) }))
    await m.openAppTab()
    await m.flush()
    await act(async () => {
      m.button('check for updates').click()
    })
    await m.flush()
    expect(document.body.textContent).toContain('check failed: offline')
    expect(document.body.textContent).not.toContain('checking...')
    expect(m.button('check for updates').disabled).toBe(false)
  })

  it('reports a failed save-folder picker and leaves the move button usable', async () => {
    const migrateDataRoot = vi.fn(() => Promise.resolve({ settings: SETTINGS, migrated: false }))
    const m = await mount(
      bridge({ pickSaveDir: () => Promise.reject(new Error('no dialog')), migrateDataRoot }),
    )
    await m.openAppTab()
    await m.flush()
    await act(async () => {
      m.button('move…').click()
    })
    await m.flush()
    expect(document.body.textContent).toContain('could not choose a save folder: no dialog')
    expect(migrateDataRoot).not.toHaveBeenCalled()
    expect(m.button('move…').disabled).toBe(false)
  })

  it('migrates to the folder the picker returns', async () => {
    const migrateDataRoot = vi.fn(() =>
      Promise.resolve({ settings: SETTINGS, migrated: true, previousFolderKept: '/old' }),
    )
    const m = await mount(bridge({ pickSaveDir: () => Promise.resolve('/new/dir'), migrateDataRoot }))
    await m.openAppTab()
    await m.flush()
    await act(async () => {
      m.button('move…').click()
    })
    await m.flush()
    // The migration is confirmed before it runs.
    await act(async () => {
      settleConfirm(true)
    })
    await m.flush()
    expect(migrateDataRoot).toHaveBeenCalledWith({ targetDir: '/new/dir' })
    expect(document.body.textContent).toContain('worlds migrated safely')
  })

  it('reports failed screenshot and folder tools instead of dropping them', async () => {
    const m = await mount(
      bridge({
        // captureScreenshot() resolves null when it fails; it does not reject.
        screenshot: () => Promise.resolve(null),
        openWorlds: () => Promise.reject(new Error('missing folder')),
        openLogs: () => Promise.reject(new Error('missing folder')),
      }),
    )
    await m.openAppTab()
    await m.flush()
    const click = async (label: string) => {
      await act(async () => {
        m.button(label).click()
      })
      await m.flush()
    }
    await click('take screenshot')
    expect(document.body.textContent).toContain('could not take a screenshot: the capture failed')
    await click('open worlds folder')
    expect(document.body.textContent).not.toContain('could not take a screenshot')
    expect(document.body.textContent).toContain('could not open the worlds folder: missing folder')
    await click('open logs folder')
    expect(document.body.textContent).not.toContain('could not open the worlds folder')
    expect(document.body.textContent).toContain('could not open the logs folder: missing folder')
  })
})
