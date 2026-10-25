import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import test from 'node:test'
import * as vm from 'node:vm'

// Failures in the shell must reach whoever can act on them: the renderer (as
// an IPC rejection) or the log. These drive the compiled index.js with fake
// Electron objects, as the window tests do.

type Handler = (...args: unknown[]) => unknown

function loadIndex(options: {
  loadUrl: (url: string) => Promise<void>
  setLoginItemSettings?: () => void
}) {
  const handles: Record<string, Handler> = {}
  const handlers: Record<string, Handler[]> = {}
  class FakeWindow extends EventEmitter {
    destroyed = false
    webContents = {
      send: () => {},
      setWindowOpenHandler: () => {},
      openDevTools: () => {},
      on: (event: string, handler: Handler) => {
        ;(handlers[event] ??= []).push(handler)
      },
      session: {
        setPermissionCheckHandler: () => {},
        setPermissionRequestHandler: () => {},
      },
    }
    loadFile() {
      return Promise.resolve()
    }
    loadURL(url: string) {
      return options.loadUrl(url)
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
    getPath: () => '/tmp/thehumanbox-test',
    on() {},
    requestSingleInstanceLock: () => true,
    whenReady: () => new Promise<void>(() => {}),
    setLoginItemSettings: options.setLoginItemSettings ?? (() => {}),
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
          Menu: { setApplicationMenu() {}, buildFromTemplate: () => ({}) },
          ipcMain: { handle: (channel: string, handler: Handler) => { handles[channel] = handler } },
          screen: { getAllDisplays: () => [] },
          shell: { openExternal: () => Promise.resolve() },
          globalShortcut: { register: () => true, unregisterAll() {} },
          session: { defaultSession: {} },
        }
      }
      if (id === './startup-lifecycle') return { startWhenReady: () => {} }
      if (id === './settings') {
        return { loadSettings: () => ({ autoLaunch: true, startMinimized: false, saveLocationOverride: null, locale: null }) }
      }
      if (id === './sim-process') return { startSim: async () => ({ port: 8000, commandToken: 'T' }) }
      if (id === './ipc') return { registerIpc: () => {} }
      if (id === './updater') return { initUpdater: () => {}, checkForUpdatesNow: async () => ({}), installDownloadedUpdate: () => ({}) }
      if (id === 'node:fs') return { readFileSync: () => { throw new Error('no saved state') }, existsSync: () => false }
      if (id === 'node:path') return path
      if (id === './app-version-arg') return { appVersionArgument: (v: string) => `--thb-app-version=${v}` }
      if (id === './app-icon') return { appIconPath: () => '/tmp/icon.png' }
      if (id === './i18n') return require(path.join(__dirname, 'i18n'))
      if (id === './app-menu') return require(path.join(__dirname, 'app-menu'))
      if (id === './redact-url') return require(path.join(__dirname, 'redact-url'))
      if (id === './renderer-load') return require(path.join(__dirname, 'renderer-load'))
      if (id === './navigation-guard') return require(path.join(__dirname, 'navigation-guard'))
      if (id === './error-dialog') return require(path.join(__dirname, 'error-dialog'))
      if (id === './exclusive-operation') return require(path.join(__dirname, 'exclusive-operation'))
      if (id === './login-launch') return require(path.join(__dirname, 'login-launch'))
      if (id === './window-state') return require(path.join(__dirname, 'window-state'))
      if (id === './world-safety') return require(path.join(__dirname, 'world-safety'))
      return {}
    },
  })
  vm.runInContext(readFileSync(path.join(__dirname, 'index.js'), 'utf8'), context)
  return { context, handles, handlers }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 20))

test('a boot error page that cannot be loaded after a renderer failure is not an unhandled rejection', async () => {
  const unhandled: unknown[] = []
  const record = (reason: unknown) => { unhandled.push(reason) }
  process.on('unhandledRejection', record)
  try {
    // Electron rejects loadURL with ERR_ABORTED when a newer navigation replaces it.
    const { context, handlers } = loadIndex({
      loadUrl: () => Promise.reject(Object.assign(new Error('ERR_ABORTED (-3) loading data:'), { code: 'ERR_ABORTED' })),
    })
    await vm.runInContext('createWindow()', context)
    const failed = handlers['did-fail-load'][0]
    failed({}, -6, 'ERR_FILE_NOT_FOUND', 'file:///r/index.html?token=T', true)
    await tick()
    assert.deepEqual(unhandled, [])
  } finally {
    process.off('unhandledRejection', record)
  }
})

test('the desktop login-item setting reports a failure to the renderer instead of succeeding', async () => {
  const { context, handles } = loadIndex({
    loadUrl: () => Promise.resolve(),
    setLoginItemSettings: () => {
      throw new Error('login items are blocked by the system')
    },
  })
  vm.runInContext('registerAppIpcHandlers()', context)
  await assert.rejects(
    Promise.resolve().then(() => handles['app:applyAutoLaunch']({})),
    /login items are blocked/,
  )
})
