import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import * as fs from 'node:fs'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import test from 'node:test'
import * as vm from 'node:vm'

// The window's size, position and modes are saved with a 400 ms debounce, and
// restored when the next window opens. These tests drive the real window code
// through the compiled index.js with a fake BrowserWindow.

type Bounds = { x: number; y: number; width: number; height: number }

type Saved = Bounds & { maximized: boolean; fullscreen?: boolean; alwaysOnTop?: boolean }

class FakeWindow extends EventEmitter {
  destroyed = false
  bounds: Bounds = { x: 0, y: 0, width: 1400, height: 900 }
  maximized = false
  fullScreen = false
  onTop = false
  calls: string[] = []
  webContents = {
    send: () => {},
    on: () => {},
    setWindowOpenHandler: () => {},
    openDevTools: () => {},
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
    return this.bounds
  }
  getNormalBounds() {
    return this.bounds
  }
  isMaximized() {
    return this.maximized
  }
  isFullScreen() {
    return this.fullScreen
  }
  setFullScreen(on: boolean) {
    this.calls.push(`setFullScreen:${on}`)
    this.fullScreen = on
  }
  isAlwaysOnTop() {
    return this.onTop
  }
  setAlwaysOnTop(on: boolean) {
    this.calls.push(`setAlwaysOnTop:${on}`)
    this.onTop = on
  }
  isDestroyed() {
    return this.destroyed
  }
  isVisible() {
    return true
  }
  isMinimized() {
    return false
  }
  show() {
    this.calls.push('show')
  }
  focus() {}
  maximize() {
    this.calls.push('maximize')
  }
  close() {
    this.emit('close')
    this.destroyed = true
    this.emit('closed')
  }
}

// When set, the simulation does not finish starting until this resolves, so a
// test can keep a replacement window in its startup while it moves.
let simGate: Promise<void> | null = null

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Load index.js with a fake Electron and a real user-data folder; returns the window it creates. */
function openFirstWindow(userData: string): {
  win: () => FakeWindow
  windows: FakeWindow[]
  run: (code: string) => Promise<unknown>
} {
  const windows: FakeWindow[] = []
  class Window extends FakeWindow {
    constructor() {
      super()
      windows.push(this)
    }
  }
  const app = {
    setName() {},
    isPackaged: true,
    getVersion: () => '0.0.0-test',
    on() {},
    requestSingleInstanceLock: () => true,
    whenReady: () => new Promise<void>(() => {}),
    getPath: (name: string) => (name === 'userData' ? userData : path.join(userData, name)),
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
          BrowserWindow: Window,
          Menu: { setApplicationMenu() {}, buildFromTemplate: () => ({}) },
          screen: { getAllDisplays: () => [{ workArea: { x: 0, y: 0, width: 4000, height: 3000 } }] },
          shell: { openExternal: () => Promise.resolve() },
        }
      }
      if (id === './startup-lifecycle') return { startWhenReady: () => {} }
      if (id === './settings') return { loadSettings: () => ({}) }
      if (id === './sim-process') {
        return {
          startSim: async () => {
            if (simGate) await simGate
            return { port: 8000, commandToken: 'T' }
          },
        }
      }
      if (id === './ipc') return { registerIpc: () => {} }
      if (id === './updater') return { initUpdater: () => {}, checkForUpdatesNow: async () => ({}), installDownloadedUpdate: () => ({}) }
      if (id === 'node:fs') return fs
      if (id === 'node:path') return path
      if (id === './app-version-arg') return { appVersionArgument: (v: string) => `--thb-app-version=${v}` }
      if (id === './app-icon') return { appIconPath: () => '/tmp/icon.png' }
      for (const local of [
        'renderer-load',
        'window-state',
        'world-safety',
        'i18n',
        'navigation-guard',
        'redact-url',
        'error-dialog',
        'exclusive-operation',
        'prompt-relevance',
        'restart-recovery',
        'login-launch',
        'renderer-csp',
        'sim-errors',
      ]) {
        if (id === `./${local}`) return require(path.join(__dirname, local))
      }
      return {}
    },
  })
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8'), context)
  return {
    win: () => {
      const last = windows.at(-1)
      if (!last) throw new Error('no window was created')
      return last
    },
    windows,
    run: (code: string) => Promise.resolve(vm.runInContext(code, context)),
  }
}

function readSaved(userData: string): Saved {
  return JSON.parse(readFileSync(path.join(userData, 'window-state.json'), 'utf8')) as Saved
}

function withUserData(run: (userData: string) => Promise<void>): Promise<void> {
  const userData = mkdtempSync(path.join(tmpdir(), 'thb-window-state-'))
  return run(userData).finally(() => rmSync(userData, { recursive: true, force: true }))
}

test('a move or resize made just before quitting is saved, not lost to the debounce', () =>
  withUserData(async (userData) => {
    const opened = openFirstWindow(userData)
    await opened.run('createWindow()')
    const win = opened.win()

    // The player drags the window, then quits before the 400 ms save delay ends.
    win.bounds = { x: 120, y: 80, width: 1600, height: 950 }
    win.emit('move')
    win.emit('resize')
    win.close()

    await sleep(600)
    assert.deepEqual(readSaved(userData), {
      x: 120,
      y: 80,
      width: 1600,
      height: 950,
      maximized: false,
      fullscreen: false,
      alwaysOnTop: false,
    })
  }))

test('full screen and always on top are saved when the window closes', () =>
  withUserData(async (userData) => {
    const opened = openFirstWindow(userData)
    await opened.run('createWindow()')
    const win = opened.win()
    win.fullScreen = true
    win.onTop = true
    win.close()

    await sleep(0)
    const saved = readSaved(userData)
    assert.equal(saved.fullscreen, true)
    assert.equal(saved.alwaysOnTop, true)
  }))

test('a saved full screen and always-on-top window is restored on the next launch', () =>
  withUserData(async (userData) => {
    writeFileSync(
      path.join(userData, 'window-state.json'),
      JSON.stringify({ x: 100, y: 80, width: 1200, height: 800, maximized: false, fullscreen: true, alwaysOnTop: true }),
    )
    const opened = openFirstWindow(userData)
    await opened.run('createWindow()')
    const win = opened.win()
    assert.ok(win.calls.includes('setAlwaysOnTop:true'), `calls: ${win.calls.join(', ')}`)
    assert.ok(win.calls.includes('setFullScreen:true'), `calls: ${win.calls.join(', ')}`)
  }))

test('a replaced window that closes late does not overwrite the state the new window saved', () =>
  withUserData(async (userData) => {
    const opened = openFirstWindow(userData)
    await opened.run('createWindow()')
    const oldWindow = opened.windows[0]

    // Restart the simulation. The replacement opens while the old window is
    // still up, and the old window closes only once the new one has started.
    // Hold the start open so the new window can be moved and saved meanwhile.
    let release: () => void = () => {}
    simGate = new Promise<void>((resolve) => {
      release = resolve
    })
    const restarting = opened.run('createWindowReplace()')
    await sleep(0)
    const newWindow = opened.windows[1]
    assert.ok(newWindow, 'the replacement window exists while the old one is still open')
    assert.equal(oldWindow.destroyed, false)

    newWindow.bounds = { x: 400, y: 300, width: 1500, height: 880 }
    newWindow.emit('move')
    await sleep(100)
    // The old window is moved as well, so its own save timer is still pending.
    // It fires after the new window's save and must not write over it.
    oldWindow.bounds = { x: 10, y: 10, width: 1200, height: 700 }
    oldWindow.emit('move')
    await sleep(600)
    assert.equal(readSaved(userData).width, 1500)

    // Startup finishes, and the old window closes with its own, stale bounds.
    release()
    simGate = null
    await restarting
    assert.equal(oldWindow.destroyed, true)

    assert.deepEqual(readSaved(userData), {
      x: 400,
      y: 300,
      width: 1500,
      height: 880,
      maximized: false,
      fullscreen: false,
      alwaysOnTop: false,
    })
  }))
