import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import test from 'node:test'
import * as vm from 'node:vm'
import * as redactUrl from './redact-url'
import * as rendererLoad from './renderer-load'

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
    isAlwaysOnTop() { return false }
    show() {}
    isVisible() { return true }
    maximize() {}
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
      if (id === 'electron') return { app, BrowserWindow: FakeWindow, Menu: { setApplicationMenu() {}, buildFromTemplate: () => ({}) } }
      if (id === './startup-lifecycle') return { startWhenReady: () => {} }
      if (id === './settings') return { loadSettings: () => ({}) }
      if (id === './sim-process') return { startSim: async () => ({ port: 8000 }) }
      if (id === 'node:fs') return { readFileSync: () => { throw new Error('no saved bounds') } }
      if (id === './app-version-arg') return { appVersionArgument: (v: string) => `--thb-app-version=${v}` }
      if (id === './app-icon') return { appIconPath: () => '/tmp/icon.png' }
      if (id === 'node:path') return path
      if (id === './renderer-load') return rendererLoad
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
    isAlwaysOnTop() { return false }
    show() {}
    isVisible() { return true }
    maximize() {}
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
      if (id === 'electron') return { app, BrowserWindow: FakeWindow, Menu: { setApplicationMenu() {}, buildFromTemplate: () => ({}) } }
      if (id === './startup-lifecycle') return { startWhenReady: () => {} }
      if (id === './settings') return { loadSettings: () => ({}) }
      if (id === './sim-process') return { startSim: async () => ({ port: 8000 }) }
      if (id === 'node:fs') return { readFileSync: () => { throw new Error('no saved bounds') } }
      if (id === './app-version-arg') return { appVersionArgument: (v: string) => `--thb-app-version=${v}` }
      if (id === './app-icon') return { appIconPath: () => '/tmp/icon.png' }
      if (id === 'node:path') return path
      if (id === './redact-url') return redactUrl
      if (id === './renderer-load') return rendererLoad
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

test('the failed-load log line and boot page never show the command token', async () => {
  const logged: string[] = []
  const openedUrls: string[] = []
  class FakeWindow extends EventEmitter {
    destroyed = false
    handlers: Record<string, Array<(...args: unknown[]) => void>> = {}
    webContents = {
      send: () => {},
      setWindowOpenHandler: () => {},
      session: {
        setPermissionCheckHandler: () => {},
        setPermissionRequestHandler: () => {},
      },
      on: (event: string, handler: (...args: unknown[]) => void) => {
        ;(this.handlers[event] ??= []).push(handler)
      },
    }
    constructor() { super() }
    async loadFile(file: string, options?: { query?: Record<string, string> }) {
      const query = new URLSearchParams(options?.query ?? {}).toString()
      this.rendererUrls.push(`${file}?${query}`)
    }
    rendererUrls: string[] = []
    loadURL(url: string) { openedUrls.push(url); return Promise.resolve() }
    isDestroyed() { return this.destroyed }
    isAlwaysOnTop() { return false }
    show() {}
    isVisible() { return true }
    maximize() {}
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
    exports: {}, __dirname, process, setTimeout, clearTimeout,
    console: { log() {}, warn() {}, error: (...args: unknown[]) => logged.push(args.map(String).join(' ')) },
    require: (id: string) => {
      if (id === 'electron') {
        return {
          app,
          BrowserWindow: FakeWindow,
          Menu: { setApplicationMenu() {}, buildFromTemplate: () => ({}) },
          shell: { openExternal: () => Promise.resolve() },
        }
      }
      if (id === './startup-lifecycle') return { startWhenReady: () => {} }
      if (id === './settings') return { loadSettings: () => ({}) }
      if (id === './sim-process') return { startSim: async () => ({ port: 8000, commandToken: 'SECRET-TOKEN' }) }
      if (id === 'node:fs') return { readFileSync: () => { throw new Error('no saved bounds') } }
      if (id === './app-version-arg') return { appVersionArgument: (v: string) => `--thb-app-version=${v}` }
      if (id === './app-icon') return { appIconPath: () => '/tmp/icon.png' }
      if (id === 'node:path') return path
      if (id === './redact-url') return redactUrl
      if (id === './renderer-load') return rendererLoad
      if (id === './navigation-guard') return require(path.join(__dirname, 'navigation-guard'))
      return {}
    },
  })
  vm.runInContext(readFileSync(path.join(__dirname, 'index.js'), 'utf8'), context)
  await vm.runInContext('createWindow()', context)
  await new Promise((resolve) => setImmediate(resolve))

  const win = vm.runInContext('mainWindow', context) as FakeWindow
  assert.equal(new URLSearchParams(win.rendererUrls[0].split('?')[1]).has('api'), false)
  assert.ok(win.rendererUrls.some((url) => url.includes('token=SECRET-TOKEN')))
  const failedLoad = win.handlers['did-fail-load'][0]
  failedLoad({}, -6, 'ERR_FILE_NOT_FOUND', `${win.rendererUrls.at(-1)}&extra=1`, true)

  assert.equal(logged.join('\n').includes('SECRET-TOKEN'), false)
  assert.equal(openedUrls.length, 1)
  assert.equal(decodeURIComponent(openedUrls[0]).includes('SECRET-TOKEN'), false)
  assert.ok(decodeURIComponent(openedUrls[0]).includes('Renderer failed to load.'))
})
