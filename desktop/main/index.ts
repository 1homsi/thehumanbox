import { app, BrowserWindow, ipcMain, shell } from 'electron'
import * as path from 'node:path'
import { registerIpc } from './ipc'
import { startSim, stopSim, activeSim } from './sim-process'
import { loadSettings } from './settings'
import { initUpdater } from './updater'

const isDev = !app.isPackaged
let mainWindow: BrowserWindow | null = null

async function createWindow(): Promise<void> {
  const settings = loadSettings()

  let bootUrl: string
  if (settings.mode === 'remote') {
    bootUrl = `${settings.remoteUrl}/?desktop=1`
  } else {
    const sim = await startSim(settings).catch((err) => {
      console.error('[main] failed to start local sim:', err)
      return null
    })
    if (sim) {
      bootUrl = `http://127.0.0.1:${sim.port}/?desktop=1`
    } else {
      bootUrl = `${settings.remoteUrl}/?desktop=1&fallback=1`
    }
  }

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: 'The Human Box',
    backgroundColor: '#0c0a08',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url).catch(() => {})
    return { action: 'deny' }
  })

  if (isDev) {
    const indexFile = path.join(__dirname, '..', 'renderer', 'index.html')
    await mainWindow.loadFile(indexFile, { query: { boot: bootUrl } })
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    await mainWindow.loadURL(bootUrl)
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(async () => {
  registerIpc(ipcMain, () => mainWindow)
  await createWindow()
  initUpdater(() => mainWindow)
})

app.on('window-all-closed', async () => {
  await stopSim()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', async (e) => {
  if (activeSim()) {
    e.preventDefault()
    await stopSim()
    app.quit()
  }
})

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await createWindow()
  }
})
