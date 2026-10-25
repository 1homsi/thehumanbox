import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import * as fs from 'node:fs'
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import test from 'node:test'
import * as vm from 'node:vm'

// Screenshots taken from the File/View menu, the tray or the renderer. A capture
// that cannot be saved must say so: the menu and tray used to ignore a failed
// save, and an empty capture (a hidden window) was written as an empty PNG and
// reported as saved.

type Handler = (...args: unknown[]) => unknown
type MenuItem = { label?: string; click?: () => void; submenu?: MenuItem[] }

function findMenuItem(items: MenuItem[] | undefined, label: string): MenuItem | null {
  for (const item of items ?? []) {
    if (item.label === label) return item
    const inner = findMenuItem(item.submenu, label)
    if (inner) return inner
  }
  return null
}

function loadIndex(options: { pictures: string; capture: () => Promise<{ isEmpty(): boolean; toPNG(): Buffer }> }) {
  const handles: Record<string, Handler> = {}
  const templates: MenuItem[][] = []
  const notifications: Array<{ title: string; body: string }> = []
  class FakeNotification {
    static isSupported() {
      return true
    }
    constructor(options: { title: string; body: string }) {
      notifications.push({ title: options.title, body: options.body })
    }
    on() {}
    show() {}
  }
  class FakeWindow extends EventEmitter {
    destroyed = false
    webContents = {
      send: () => {},
      on: () => {},
      setWindowOpenHandler: () => {},
      openDevTools: () => {},
      capturePage: options.capture,
      session: {
        setPermissionCheckHandler: () => {},
        setPermissionRequestHandler: () => {},
      },
    }
    loadFile() {
      return Promise.resolve()
    }
    loadURL() {
      return Promise.resolve()
    }
    getBounds() {
      return { x: 0, y: 0, width: 1400, height: 900 }
    }
    getNormalBounds() {
      return { x: 0, y: 0, width: 1400, height: 900 }
    }
    isMaximized() {
      return false
    }
    isFullScreen() {
      return false
    }
    isDestroyed() {
      return this.destroyed
    }
    isAlwaysOnTop() {
      return false
    }
    isVisible() {
      return true
    }
    show() {}
    maximize() {}
  }
  const app = {
    setName() {},
    isPackaged: true,
    getVersion: () => '0.0.0-test',
    getPath: (name: string) => (name === 'pictures' ? options.pictures : '/tmp/thehumanbox-test'),
    on() {},
    requestSingleInstanceLock: () => true,
    whenReady: () => new Promise<void>(() => {}),
  }
  const context = vm.createContext({
    exports: {},
    __dirname,
    process,
    console: { log() {}, warn() {}, error() {} },
    setTimeout,
    clearTimeout,
    require: (id: string) => {
      if (id === 'electron') {
        return {
          app,
          BrowserWindow: FakeWindow,
          Notification: FakeNotification,
          ipcMain: { handle: (channel: string, handler: Handler) => { handles[channel] = handler } },
          Menu: {
            setApplicationMenu() {},
            buildFromTemplate: (template: MenuItem[]) => {
              templates.push(template)
              return {}
            },
          },
          screen: { getAllDisplays: () => [] },
          shell: { openExternal: () => Promise.resolve(), showItemInFolder() {} },
          globalShortcut: { register: () => true, unregisterAll() {} },
          session: { defaultSession: {} },
        }
      }
      if (id === './startup-lifecycle') return { startWhenReady: () => {} }
      if (id === './settings') return { loadSettings: () => ({ autoLaunch: false, startMinimized: false, saveLocationOverride: null, locale: null }) }
      if (id === './sim-process') return { startSim: async () => ({ port: 8000, commandToken: 'T' }) }
      if (id === './ipc') return { registerIpc: () => {} }
      if (id === './updater') return { initUpdater: () => {}, checkForUpdatesNow: async () => ({}), installDownloadedUpdate: () => ({}) }
      if (id === 'node:fs') return fs
      if (id === 'node:path') return path
      if (id === './app-version-arg') return { appVersionArgument: (v: string) => `--thb-app-version=${v}` }
      if (id === './app-icon') return { appIconPath: () => '/tmp/icon.png' }
      for (const local of ['i18n', 'redact-url', 'renderer-load', 'navigation-guard', 'error-dialog', 'exclusive-operation', 'window-state', 'world-safety', 'login-launch', 'prompt-relevance', 'restart-recovery', 'renderer-csp', 'sim-errors']) {
        if (id === `./${local}`) return require(path.join(__dirname, local))
      }
      return {}
    },
  })
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8'), context)
  // Expose the registered IPC handlers too: registerAppIpcHandlers runs at boot.
  vm.runInContext('registerAppIpcHandlers()', context)
  return { context, handles, templates, notifications }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 20))

test('a screenshot of a window with nothing to capture is refused, not saved as an empty file', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'thb-shot-'))
  try {
    const pictures = path.join(root, 'Pictures')
    fs.mkdirSync(pictures)
    // A hidden window (tray mode) captures as an empty image.
    const { context, handles } = loadIndex({
      pictures,
      capture: async () => ({ isEmpty: () => true, toPNG: () => Buffer.alloc(0) }),
    })
    await vm.runInContext('createWindow()', context)
    await assert.rejects(Promise.resolve().then(() => handles['app:screenshot']({})), /nothing to capture/)
    const folder = path.join(pictures, 'TheHumanBox')
    const saved = fs.existsSync(folder) ? readdirSync(folder).filter((name) => name.endsWith('.png')) : []
    assert.deepEqual(saved, [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a screenshot from the menu tells the player when it could not be saved', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'thb-shot-'))
  try {
    // The pictures folder is a file, so the screenshot folder cannot be created.
    const pictures = path.join(root, 'Pictures')
    writeFileSync(pictures, 'not a folder')
    const { context, templates, notifications } = loadIndex({
      pictures,
      capture: async () => ({ isEmpty: () => false, toPNG: () => Buffer.from([0x89, 0x50, 0x4e, 0x47]) }),
    })
    await vm.runInContext('createWindow()', context)
    const menu = templates.at(-1)
    const item = findMenuItem(menu, 'Screenshot')
    assert.ok(item?.click, 'the View menu has a Screenshot item')
    item.click()
    await tick()
    const failure = notifications.find((n) => n.title === 'Screenshot not saved')
    assert.ok(failure, `notifications: ${JSON.stringify(notifications)}`)
    assert.ok(failure.body.length > 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
