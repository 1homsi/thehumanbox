import { app, BrowserWindow, globalShortcut, ipcMain, shell } from 'electron'
import * as path from 'node:path'
import { registerIpc } from './ipc'
import { startSim, stopSim, activeSim } from './sim-process'
import { loadSettings } from './settings'
import { initUpdater } from './updater'

const isDev = !app.isPackaged
let mainWindow: BrowserWindow | null = null

function renderBootError(detail: string): string {
  const safe = detail.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!))
  return `data:text/html;charset=utf-8,${encodeURIComponent(`
<!doctype html><html><head><meta charset="utf-8"><title>The Human Box — startup error</title>
<style>
  html,body{margin:0;background:#0c0a08;color:#f5e9d4;font:14px/1.5 ui-monospace,monospace}
  .wrap{padding:24px;max-width:780px;margin:0 auto}
  h1{font-size:18px;color:#ff9b6b;margin:0 0 12px}
  pre{background:#1a1612;padding:12px;border-radius:6px;white-space:pre-wrap;word-break:break-all}
  kbd{background:#2a241d;padding:2px 6px;border-radius:3px;font-family:inherit}
  p{color:#bfae90}
</style></head><body><div class="wrap">
<h1>The Human Box couldn't start the local simulation</h1>
<pre>${safe}</pre>
<p>Open DevTools with <kbd>Cmd</kbd>+<kbd>Opt</kbd>+<kbd>I</kbd> (macOS) or <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>I</kbd> (Win/Linux) for more.</p>
<p>You can also switch to remote mode in settings (More → ⚙ desktop) and reload.</p>
</div></body></html>`)}`
}

async function createWindow(): Promise<void> {
  const settings = loadSettings()

  let bootUrl: string
  let bootError: string | null = null
  if (settings.mode === 'remote') {
    bootUrl = `${settings.remoteUrl}/?desktop=1`
  } else {
    try {
      const sim = await startSim(settings)
      bootUrl = `http://127.0.0.1:${sim.port}/?desktop=1`
    } catch (err) {
      bootError = (err as Error).message ?? String(err)
      console.error('[main] failed to start local sim:', err)
      bootUrl = renderBootError(bootError)
    }
  }

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: 'The Human Box',
    backgroundColor: '#0c0a08',
    icon: path.join(__dirname, '..', '..', 'build', 'icon.png'),
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

  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error(`[main] did-fail-load code=${code} desc=${desc} url=${url}`)
    mainWindow?.loadURL(renderBootError(`Renderer failed to load.\nURL: ${url}\nCode: ${code}\n${desc}`))
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

  const toggleDevTools = (): void => {
    if (!mainWindow) return
    if (mainWindow.webContents.isDevToolsOpened()) {
      mainWindow.webContents.closeDevTools()
    } else {
      mainWindow.webContents.openDevTools({ mode: 'detach' })
    }
  }
  globalShortcut.register(process.platform === 'darwin' ? 'Cmd+Alt+I' : 'Ctrl+Shift+I', toggleDevTools)
  globalShortcut.register(process.platform === 'darwin' ? 'Cmd+R' : 'Ctrl+R', () => mainWindow?.reload())
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
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
