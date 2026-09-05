import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import test from 'node:test'
import * as vm from 'node:vm'

test('replacing a window retains the new window and routes old events to their owner', async () => {
  const windows: FakeWindow[] = []
  class FakeWindow extends EventEmitter {
    messages: unknown[][] = []
    destroyed = false
    webContents = {
      send: (...args: unknown[]) => this.messages.push(args),
      setWindowOpenHandler: () => {},
      on: () => {},
    }
    constructor() { super(); windows.push(this) }
    async loadFile() {}
    close() { this.destroyed = true; this.emit('closed') }
    isDestroyed() { return this.destroyed }
  }
  const app = { setName() {}, isPackaged: true, on() {}, whenReady: () => ({ then() {} }) }
  const context = vm.createContext({
    exports: {}, __dirname, process, console, setTimeout, clearTimeout,
    require: (id: string) => {
      if (id === 'electron') return { app, BrowserWindow: FakeWindow }
      if (id === './settings') return { loadSettings: () => ({}) }
      if (id === './sim-process') return { startSim: async () => ({ port: 8000 }) }
      if (id === 'node:fs') return { readFileSync: () => { throw new Error('no saved bounds') } }
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
