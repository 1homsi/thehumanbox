import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import test from 'node:test'
import * as vm from 'node:vm'

function harness() {
  const windows: FakeWindow[] = []
  const notifications: FakeNotification[] = []
  class FakeWindow extends EventEmitter {
    destroyed = false
    visible = true
    calls: string[] = []
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
    isDestroyed() { return this.destroyed }
    isMinimized() { return false }
    isVisible() { return this.visible }
    show() { this.calls.push('show'); this.visible = true }
    hide() { this.calls.push('hide'); this.visible = false }
    focus() { this.calls.push('focus') }
    restore() { this.calls.push('restore') }
    maximize() { this.calls.push('maximize') }
  }
  class FakeNotification {
    handlers: Record<string, () => void> = {}
    static isSupported() { return true }
    constructor() { notifications.push(this) }
    on(event: string, handler: () => void) { this.handlers[event] = handler }
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
  return { context, windows, notifications }
}

test('clicking a milestone notification reveals a visible window instead of hiding it', async () => {
  const { context, windows, notifications } = harness()
  await vm.runInContext('createWindow()', context)
  vm.runInContext('notifyMilestone("Headline", "body")', context)
  notifications[0].handlers.click()
  assert.equal(windows[0].visible, true)
  assert.equal(windows[0].calls.includes('hide'), false)
  assert.ok(windows[0].calls.includes('focus'))
})

test('clicking a milestone notification with no window open creates one', async () => {
  const { context, windows, notifications } = harness()
  vm.runInContext('notifyMilestone("Headline", "body")', context)
  notifications[0].handlers.click()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(windows.length, 1)
})
