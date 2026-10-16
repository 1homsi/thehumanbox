import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import test from 'node:test'
import * as vm from 'node:vm'
import * as redactUrl from './redact-url'

test('replacing a window retains the new window and routes old events to their owner', async () => {
  const windows: FakeWindow[] = []
  class FakeWindow extends EventEmitter {
    messages: unknown[][] = []
    destroyed = false
    webContents = {
      send: (...args: unknown[]) => this.messages.push(args),
      setWindowOpenHandler: () => {},
      session: {
        setPermissionCheckHandler: () => {},
        setPermissionRequestHandler: () => {},
      },
      on: () => {},
    }
    constructor() { super(); windows.push(this) }
    async loadFile() {}
    close() { this.destroyed = true; this.emit('closed') }
    isDestroyed() { return this.destroyed }
  }
  // `whenReady` never settles: this test drives `createWindow` /
  // `createWindowReplace` directly and is not about the boot chain, so
  // letting it run would only add unrelated side effects (it needs a real
  // Promise, since the module attaches boot to it).
  const app = {
    setName() {},
    isPackaged: true,
    getVersion: () => "0.0.0-test",
    on() {},
    requestSingleInstanceLock: () => true,
    whenReady: () => new Promise<void>(() => {}),
  }
  const context = vm.createContext({
    exports: {}, __dirname, process, console, setTimeout, clearTimeout,
    require: (id: string) => {
      if (id === 'electron') return { app, BrowserWindow: FakeWindow }
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
  await vm.runInContext('createWindowReplace()', context)
  assert.equal(windows[0].destroyed, true)
  assert.equal(vm.runInContext('mainWindow', context), windows[1])
  windows[0].emit('hide')
  assert.equal(windows[1].messages.length, 0)
  assert.deepEqual(windows[0].messages, [['app:visibility', 'hidden']])
  windows[1].close()
  assert.equal(vm.runInContext('mainWindow', context), null)
})

test('a renderer that fails to load does not carry the command token in its error', async () => {
  class FakeWindow extends EventEmitter {
    destroyed = false
    webContents = {
      send: () => {},
      setWindowOpenHandler: () => {},
      session: {
        setPermissionCheckHandler: () => {},
        setPermissionRequestHandler: () => {},
      },
      on: () => {},
    }
    constructor() { super() }
    async loadFile() {
      throw new Error("ERR_FILE_NOT_FOUND (-6) loading 'file:///r/index.html?desktop=1&api=127.0.0.1:8000&token=SECRET-TOKEN'")
    }
    isDestroyed() { return this.destroyed }
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
      if (id === 'electron') return { app, BrowserWindow: FakeWindow }
      if (id === './startup-lifecycle') return { startWhenReady: () => {} }
      if (id === './settings') return { loadSettings: () => ({}) }
      if (id === './sim-process') return { startSim: async () => ({ port: 8000 }) }
      if (id === 'node:fs') return { readFileSync: () => { throw new Error('no saved bounds') } }
      if (id === './app-version-arg') return { appVersionArgument: (v: string) => `--thb-app-version=${v}` }
      if (id === './app-icon') return { appIconPath: () => '/tmp/icon.png' }
      if (id === 'node:path') return path
      if (id === './redact-url') return redactUrl
      return {}
    },
  })
  vm.runInContext(readFileSync(path.join(__dirname, 'index.js'), 'utf8'), context)
  await assert.rejects(vm.runInContext('createWindow()', context), (error: Error) => {
    assert.equal(error.message.includes('SECRET-TOKEN'), false)
    assert.ok(error.message.includes('ERR_FILE_NOT_FOUND'))
    return true
  })
})
