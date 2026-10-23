import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import test from 'node:test'
import * as vm from 'node:vm'

test('File > Restart simulation brings the window back when no window is open', async () => {
  const windows: FakeWindow[] = []
  let simStarts = 0
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
    constructor() { super(); windows.push(this) }
    async loadFile() {}
    close() { this.destroyed = true; this.emit('closed') }
    isDestroyed() { return this.destroyed }
    isAlwaysOnTop() { return false }
    show() {}
    isVisible() { return true }
    maximize() {}
  }
  // macOS: closing the last window stops the sim and the app stays in the
  // dock, so the menu restart runs with mainWindow === null and no sim.
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
      if (id === 'electron') {
        return {
          app,
          BrowserWindow: FakeWindow,
          Menu: { setApplicationMenu() {}, buildFromTemplate: () => ({}) },
        }
      }
      if (id === './startup-lifecycle') return { startWhenReady: () => {} }
      if (id === './settings') return { loadSettings: () => ({}) }
      if (id === './exclusive-operation') {
        return {
          runExclusiveDesktopOperation: async (_name: string, run: () => Promise<void>) => run(),
          currentDesktopOperation: () => null,
        }
      }
      if (id === './sim-process') {
        return {
          startSim: async () => { simStarts += 1; return { port: 8000 } },
          stopSim: async () => {},
          activeSim: () => null,
          onUnexpectedSimExit: () => {},
        }
      }
      if (id === 'node:fs') return { readFileSync: () => { throw new Error('no saved bounds') } }
      if (id === './app-version-arg') return { appVersionArgument: (v: string) => `--thb-app-version=${v}` }
      if (id === './app-icon') return { appIconPath: () => '/tmp/icon.png' }
      if (id === 'node:path') return path
      if (id === './renderer-load') return require(path.join(__dirname, 'renderer-load'))
      if (id === './i18n') return require(path.join(__dirname, 'i18n'))
      return {}
    },
  })
  vm.runInContext(readFileSync(path.join(__dirname, 'index.js'), 'utf8'), context)
  await vm.runInContext('restartSimulation()', context)
  assert.equal(simStarts, 1)
  assert.equal(windows.length, 1)
  assert.equal(vm.runInContext('mainWindow', context), windows[0])
})
