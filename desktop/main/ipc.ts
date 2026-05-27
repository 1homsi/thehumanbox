import { BrowserWindow, IpcMain } from 'electron'
import { loadSettings, saveSettings, Settings } from './settings'
import { activeSim, startSim, stopSim } from './sim-process'

export function registerIpc(ipc: IpcMain, getWindow: () => BrowserWindow | null): void {
  ipc.handle('settings:get', () => loadSettings())

  ipc.handle('settings:set', async (_e, next: Settings) => {
    saveSettings(next)
    return next
  })

  ipc.handle('sim:status', () => {
    const sim = activeSim()
    return sim ? { running: true, port: sim.port } : { running: false, port: null }
  })

  ipc.handle('sim:restart', async () => {
    await stopSim()
    const s = loadSettings()
    if (s.mode === 'local') {
      try {
        const sim = await startSim(s)
        const win = getWindow()
        if (win) {
          await win.loadURL(`http://127.0.0.1:${sim.port}/?desktop=1`)
        }
        return { running: true, port: sim.port }
      } catch (e) {
        return { running: false, port: null, error: (e as Error).message }
      }
    }
    const win = getWindow()
    if (win) {
      await win.loadURL(`${s.remoteUrl}/?desktop=1`)
    }
    return { running: false, port: null }
  })

  ipc.handle('app:reload', async () => {
    const win = getWindow()
    win?.reload()
  })
}
