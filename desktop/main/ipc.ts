import { BrowserWindow, IpcMain } from 'electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { loadSettings, saveSettings, Settings, worldsRoot } from './settings'
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
    const indexFile = path.join(__dirname, '..', 'renderer', 'index.html')
    if (s.mode === 'local') {
      try {
        const sim = await startSim(s)
        const win = getWindow()
        if (win) {
          await win.loadFile(indexFile, { query: { desktop: '1', api: `127.0.0.1:${sim.port}` } })
        }
        return { running: true, port: sim.port }
      } catch (e) {
        return { running: false, port: null, error: (e as Error).message }
      }
    }
    const win = getWindow()
    if (win) {
      const apiBase = s.remoteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')
      await win.loadFile(indexFile, { query: { desktop: '1', api: apiBase } })
    }
    return { running: false, port: null }
  })

  ipc.handle('app:reload', async () => {
    const win = getWindow()
    win?.reload()
  })

  ipc.handle('world:importFromRemote', async (_e, payload: { hash: string; remoteUrl: string }) => {
    const { hash, remoteUrl } = payload
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(hash)) {
      throw new Error(`invalid world hash: ${hash}`)
    }
    const url = `${remoteUrl.replace(/\/+$/, '')}/worlds/${hash}/save`
    const resp = await fetch(url)
    if (!resp.ok) {
      throw new Error(`failed to fetch remote save: ${resp.status} ${resp.statusText}`)
    }
    const text = await resp.text()

    await stopSim()
    const settings = loadSettings()
    const worldsDir = worldsRoot(settings)
    fs.mkdirSync(worldsDir, { recursive: true })
    const targetDir = path.join(worldsDir, hash)
    fs.mkdirSync(targetDir, { recursive: true })
    const savePath = path.join(targetDir, 'world.save')
    fs.writeFileSync(savePath, text, 'utf8')
    fs.writeFileSync(path.join(worldsDir, '_live'), hash, 'utf8')

    if (settings.mode !== 'local') {
      saveSettings({ ...settings, mode: 'local' })
    }
    const sim = await startSim(loadSettings())
    const win = getWindow()
    if (win) {
      const indexFile = path.join(__dirname, '..', 'renderer', 'index.html')
      await win.loadFile(indexFile, {
        query: { desktop: '1', api: `127.0.0.1:${sim.port}`, imported: hash },
      })
    }
    return { running: true, port: sim.port }
  })
}
