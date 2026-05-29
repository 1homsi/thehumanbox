import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, nativeImage, Notification, shell, Tray } from 'electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { registerIpc } from './ipc'
import { startSim, stopSim, activeSim } from './sim-process'
import { loadSettings, saveSettings } from './settings'
import { initUpdater } from './updater'

app.setName('The Human Box')

const isDev = !app.isPackaged
let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
  maximized?: boolean
}

function windowStateFile(): string {
  return path.join(app.getPath('userData'), 'window-state.json')
}

function loadWindowState(): WindowState {
  try {
    const raw = fs.readFileSync(windowStateFile(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<WindowState>
    return {
      x: parsed.x,
      y: parsed.y,
      width: typeof parsed.width === 'number' && parsed.width >= 800 ? parsed.width : 1400,
      height: typeof parsed.height === 'number' && parsed.height >= 600 ? parsed.height : 900,
      maximized: parsed.maximized === true,
    }
  } catch {
    return { width: 1400, height: 900 }
  }
}

function persistWindowState(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  try {
    const bounds = win.getNormalBounds ? win.getNormalBounds() : win.getBounds()
    const state: WindowState = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      maximized: win.isMaximized(),
    }
    fs.writeFileSync(windowStateFile(), JSON.stringify(state, null, 2), 'utf8')
  } catch (e) {
    console.warn('[main] could not persist window state:', e)
  }
}

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

  let apiBase: string | null = null
  let bootErrorUrl: string | null = null
  if (settings.mode === 'remote') {
    apiBase = settings.remoteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')
  } else {
    try {
      const sim = await startSim(settings)
      apiBase = `127.0.0.1:${sim.port}`
    } catch (err) {
      const msg = (err as Error).message ?? String(err)
      console.error('[main] failed to start local sim:', err)
      bootErrorUrl = renderBootError(msg)
    }
  }

  const winState = loadWindowState()
  mainWindow = new BrowserWindow({
    x: winState.x,
    y: winState.y,
    width: winState.width,
    height: winState.height,
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
  if (winState.maximized) mainWindow.maximize()

  const persistDebounced = (() => {
    let t: NodeJS.Timeout | null = null
    return () => {
      if (t) clearTimeout(t)
      t = setTimeout(() => {
        if (mainWindow) persistWindowState(mainWindow)
      }, 400)
    }
  })()
  mainWindow.on('resize', persistDebounced)
  mainWindow.on('move', persistDebounced)
  mainWindow.on('maximize', persistDebounced)
  mainWindow.on('unmaximize', persistDebounced)

  mainWindow.on('minimize', () => {
    mainWindow?.webContents.send('app:visibility', 'minimized')
  })
  mainWindow.on('restore', () => {
    mainWindow?.webContents.send('app:visibility', 'restored')
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url).catch(() => {})
    return { action: 'deny' }
  })

  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error(`[main] did-fail-load code=${code} desc=${desc} url=${url}`)
    mainWindow?.loadURL(renderBootError(`Renderer failed to load.\nURL: ${url}\nCode: ${code}\n${desc}`))
  })

  if (bootErrorUrl) {
    await mainWindow.loadURL(bootErrorUrl)
  } else {
    const indexFile = path.join(__dirname, '..', 'renderer', 'index.html')
    const query: Record<string, string> = { desktop: '1' }
    if (apiBase) query.api = apiBase
    await mainWindow.loadFile(indexFile, { query })
    if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' })
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
        { type: 'separator' },
        {
          label: 'Always on top',
          type: 'checkbox',
          checked: mainWindow ? mainWindow.isAlwaysOnTop() : false,
          accelerator: isMac ? 'Cmd+Shift+T' : 'Ctrl+Shift+T',
          click: (item) => {
            if (!mainWindow) return
            mainWindow.setAlwaysOnTop(item.checked)
          },
        },
        {
          label: 'Screenshot',
          accelerator: isMac ? 'Cmd+Shift+S' : 'Ctrl+Shift+S',
          click: () => {
            void captureScreenshot().then((fp) => {
              if (fp) {
                notifyMilestone('Screenshot saved', fp)
                shell.showItemInFolder(fp)
              }
            })
          },
        },
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

function buildTray(): void {
  if (tray) return
  try {
    const iconPath = path.join(__dirname, '..', '..', 'build', 'icon.png')
    let img = nativeImage.createFromPath(iconPath)
    if (process.platform === 'darwin') {
      img = img.resize({ width: 18, height: 18 })
      img.setTemplateImage(true)
    } else {
      img = img.resize({ width: 22, height: 22 })
    }
    tray = new Tray(img)
    tray.setToolTip('The Human Box')
    const update = (): void => {
      if (!tray) return
      tray.setContextMenu(
        Menu.buildFromTemplate([
          {
            label: mainWindow && mainWindow.isVisible() ? 'Hide window' : 'Show window',
            click: () => toggleWindow(),
          },
          { type: 'separator' },
          {
            label: 'Switch to Local',
            click: () => {
              const cur = loadSettings()
              if (cur.mode !== 'local') saveSettings({ ...cur, mode: 'local' })
              void stopSim().then(() => createWindowReplace())
            },
          },
          {
            label: 'Switch to Remote',
            click: () => {
              const cur = loadSettings()
              if (cur.mode !== 'remote') saveSettings({ ...cur, mode: 'remote' })
              void stopSim().then(() => createWindowReplace())
            },
          },
          { type: 'separator' },
          {
            label: 'Take screenshot',
            click: () => void captureScreenshot().then((fp) => {
              if (fp) {
                notifyMilestone('Screenshot saved', fp)
                shell.showItemInFolder(fp)
              }
            }),
          },
          {
            label: 'Open worlds folder',
            click: () => {
              const dir = path.join(
                loadSettings().saveLocationOverride ?? app.getPath('userData'),
                'worlds',
              )
              fs.mkdirSync(dir, { recursive: true })
              void shell.openPath(dir)
            },
          },
          {
            label: 'Open logs folder',
            click: () => {
              const logDir = app.getPath('logs')
              fs.mkdirSync(logDir, { recursive: true })
              void shell.openPath(logDir)
            },
          },
          { type: 'separator' },
          {
            label: 'Always on top',
            type: 'checkbox',
            checked: mainWindow ? mainWindow.isAlwaysOnTop() : false,
            click: (item) => {
              if (!mainWindow) return
              mainWindow.setAlwaysOnTop(item.checked)
            },
          },
          {
            label: 'About The Human Box',
            click: () => {
              const ver = app.getVersion()
              notifyMilestone(
                'The Human Box',
                `v${ver}\nA persistent artificial-life simulation.\nthehumanbox.com`,
              )
            },
          },
          { type: 'separator' },
          { label: 'Quit The Human Box', role: 'quit' },
        ]),
      )
    }
    update()
    tray.on('click', () => toggleWindow())
    mainWindow?.on('show', update)
    mainWindow?.on('hide', update)
  } catch (e) {
    console.warn('[main] tray init failed:', e)
  }
}

function toggleWindow(): void {
  if (!mainWindow) {
    void createWindow()
    return
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore()
    mainWindow.focus()
    return
  }
  if (mainWindow.isVisible()) {
    mainWindow.hide()
  } else {
    mainWindow.show()
    mainWindow.focus()
  }
}

function notifyMilestone(title: string, body: string): void {
  if (!Notification.isSupported()) return
  const n = new Notification({ title, body, silent: false })
  n.on('click', () => toggleWindow())
  n.show()
}

function applyAutoLaunch(): void {
  try {
    const s = loadSettings()
    app.setLoginItemSettings({
      openAtLogin: s.autoLaunch,
      openAsHidden: s.startMinimized,
    })
  } catch (e) {
    console.warn('[main] setLoginItemSettings failed:', e)
  }
}

async function captureScreenshot(): Promise<string | null> {
  if (!mainWindow) return null
  try {
    const img = await mainWindow.webContents.capturePage()
    const root = path.join(app.getPath('pictures'), 'TheHumanBox')
    fs.mkdirSync(root, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const fp = path.join(root, `thb-${stamp}.png`)
    fs.writeFileSync(fp, img.toPNG())
    return fp
  } catch (e) {
    console.warn('[main] capturePage failed:', e)
    return null
  }
}

app.whenReady().then(async () => {
  registerIpc(ipcMain, () => mainWindow)
  await createWindow()
  buildMenu()
  buildTray()
  applyAutoLaunch()
  initUpdater(() => mainWindow)

  globalShortcut.register(process.platform === 'darwin' ? 'Cmd+Alt+I' : 'Ctrl+Shift+I', () => {
    if (!mainWindow) return
    if (mainWindow.webContents.isDevToolsOpened()) mainWindow.webContents.closeDevTools()
    else mainWindow.webContents.openDevTools({ mode: 'detach' })
  })

  globalShortcut.register(process.platform === 'darwin' ? 'Cmd+Shift+H' : 'Ctrl+Shift+H', toggleWindow)
  globalShortcut.register(process.platform === 'darwin' ? 'Cmd+Shift+S' : 'Ctrl+Shift+S', () => {
    void captureScreenshot().then((fp) => {
      if (fp) {
        notifyMilestone('Screenshot saved', fp)
        shell.showItemInFolder(fp)
      }
    })
  })

  ipcMain.handle('app:notify', (_e, payload: { title: string; body: string }) => {
    notifyMilestone(payload.title, payload.body)
  })

  ipcMain.handle('app:trayToggle', () => toggleWindow())

  ipcMain.handle('app:screenshot', async () => {
    const fp = await captureScreenshot()
    if (fp) {
      notifyMilestone('Screenshot saved', fp)
      shell.showItemInFolder(fp)
    }
    return fp
  })

  ipcMain.handle('app:openLogs', () => {
    const logDir = app.getPath('logs')
    fs.mkdirSync(logDir, { recursive: true })
    shell.openPath(logDir)
  })

  ipcMain.handle('app:openWorlds', () => {
    const dir = path.join(loadSettings().saveLocationOverride ?? app.getPath('userData'), 'worlds')
    fs.mkdirSync(dir, { recursive: true })
    shell.openPath(dir)
  })

  ipcMain.handle('app:applyAutoLaunch', () => {
    applyAutoLaunch()
  })

  // Native folder picker for the save-location override. Returns the
  // chosen absolute path, or null if cancelled. The renderer persists it
  // into settings.saveLocationOverride and restarts the sim.
  ipcMain.handle('app:pickSaveDir', async () => {
    if (!mainWindow) return null
    const res = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose where The Human Box stores worlds',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: loadSettings().saveLocationOverride ?? app.getPath('userData'),
    })
    if (res.canceled || res.filePaths.length === 0) return null
    return res.filePaths[0]
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
