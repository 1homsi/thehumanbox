import { app, BrowserWindow, globalShortcut, ipcMain, Menu, shell } from 'electron'
import * as path from 'node:path'
import { registerIpc } from './ipc'
import { startSim, stopSim, activeSim } from './sim-process'
import { loadSettings, saveSettings } from './settings'
import { initUpdater } from './updater'

app.setName('The Human Box')

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
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    titleBarOverlay:
      process.platform !== 'darwin'
        ? { color: '#0c0a08', symbolColor: '#f5e9d4', height: 32 }
        : undefined,
    trafficLightPosition: process.platform === 'darwin' ? { x: 14, y: 14 } : undefined,
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

function buildMenu(): void {
  const isMac = process.platform === 'darwin'

  const toggleDevTools = (): void => {
    if (!mainWindow) return
    if (mainWindow.webContents.isDevToolsOpened()) {
      mainWindow.webContents.closeDevTools()
    } else {
      mainWindow.webContents.openDevTools({ mode: 'detach' })
    }
  }

  const restartInMode = async (mode: 'local' | 'remote'): Promise<void> => {
    const cur = loadSettings()
    if (cur.mode !== mode) saveSettings({ ...cur, mode })
    await stopSim()
    if (mainWindow) {
      await createWindowReplace()
    }
  }

  const settings = loadSettings()

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: 'The Human Box',
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              {
                label: 'Settings…',
                accelerator: 'Cmd+,',
                click: () => mainWindow?.webContents.send('menu:openSettings'),
              },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Reload',
          accelerator: isMac ? 'Cmd+R' : 'Ctrl+R',
          click: () => mainWindow?.reload(),
        },
        {
          label: 'Restart simulation',
          click: () => void restartInMode(loadSettings().mode),
        },
        isMac ? { role: 'close' as const } : { role: 'quit' as const },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle DevTools',
          accelerator: isMac ? 'Cmd+Alt+I' : 'Ctrl+Shift+I',
          click: toggleDevTools,
        },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Mode',
      submenu: [
        {
          label: 'Local simulation',
          type: 'radio',
          checked: settings.mode === 'local',
          click: () => void restartInMode('local'),
        },
        {
          label: 'Remote (thehumanbox.com)',
          type: 'radio',
          checked: settings.mode === 'remote',
          click: () => void restartInMode('remote'),
        },
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        {
          label: 'Open GitHub',
          click: () => void shell.openExternal('https://github.com/1homsi/thehumanbox'),
        },
        {
          label: 'Open thehumanbox.com',
          click: () => void shell.openExternal('https://thehumanbox.com'),
        },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

async function createWindowReplace(): Promise<void> {
  const old = mainWindow
  await createWindow()
  if (old && !old.isDestroyed()) old.close()
}

app.whenReady().then(async () => {
  registerIpc(ipcMain, () => mainWindow)
  await createWindow()
  buildMenu()
  initUpdater(() => mainWindow)

  globalShortcut.register(process.platform === 'darwin' ? 'Cmd+Alt+I' : 'Ctrl+Shift+I', () => {
    if (!mainWindow) return
    if (mainWindow.webContents.isDevToolsOpened()) mainWindow.webContents.closeDevTools()
    else mainWindow.webContents.openDevTools({ mode: 'detach' })
  })
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
