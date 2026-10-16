import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import test from 'node:test'
import * as vm from 'node:vm'

test('clicking a notification shows a visible window instead of hiding it', async () => {
  const windows: FakeWindow[] = []
  const notes: FakeNotification[] = []
  class FakeWindow extends EventEmitter {
    destroyed = false
    shown = 0
    hidden = 0
    focused = 0
    visible = true
    webContents = {
      send: () => {},
      setWindowOpenHandler: () => {},
      session: {
        setPermissionCheckHandler: () => {},
        setPermissionRequestHandler: () => {},
      },
      on: () => {},
    }
    constructor() { super(); windows.push(this) }
    async loadFile() {}
    show() { this.shown += 1; this.visible = true }
    hide() { this.hidden += 1; this.visible = false }
    focus() { this.focused += 1 }
    isVisible() { return this.visible }
    isMinimized() { return false }
    close() { this.destroyed = true; this.emit('closed') }
    isDestroyed() { return this.destroyed }
  }
  class FakeNotification extends EventEmitter {
    static isSupported() { return true }
    constructor() { super(); notes.push(this) }
    show() {}
  }
  const app = {
    setName() {},
    isPackaged: true,
    getVersion: () => '0.0.0-test',
    on() {},
    requestSingleInstanceLock: () => true,
    whenReady: () => new Promise<void>(() => {}),
  }
  const context = vm.createContext({
    exports: {}, __dirname, process, console, setTimeout, clearTimeout,
    require: (id: string) => {
      if (id === 'electron') return { app, BrowserWindow: FakeWindow, Notification: FakeNotification }
      if (id === './startup-lifecycle') return { startWhenReady: () => {} }
      if (id === './settings') return { loadSettings: () => ({}) }
      if (id === './sim-process') return { startSim: async () => ({ port: 8000 }) }
      if (id === 'node:fs') return { readFileSync: () => { throw new Error('no saved bounds') } }
      if (id === './app-version-arg') return { appVersionArgument: (v: string) => `--thb-app-version=${v}` }
      if (id === './app-icon') return { appIconPath: () => '/tmp/icon.png' }
      if (id === 'node:path') return path
      return {}
    },
  })
  vm.runInContext(readFileSync(path.join(__dirname, 'index.js'), 'utf8'), context)
  await vm.runInContext('createWindow()', context)
  const win = windows[0]
  assert.equal(win.visible, true)
  vm.runInContext("notifyMilestone('Screenshot saved', '/tmp/shot.png')", context)
  notes[0].emit('click')
  assert.equal(win.hidden, 0)
  assert.equal(win.visible, true)
  assert.ok(win.shown >= 1 && win.focused >= 1)
})
