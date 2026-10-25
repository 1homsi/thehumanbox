import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import test from 'node:test'
import * as vm from 'node:vm'

// The save-folder IPC runs in its own vm context with a fake `electron`, as the
// settings tests do. These cases never reach a simulation: each is refused
// while the request is still being checked.

function loadIpc(userData: string): Record<string, (...args: unknown[]) => Promise<unknown>> {
  const handlers: Record<string, (...args: unknown[]) => Promise<unknown>> = {}
  const app = { getPath: (name: string) => (name === 'userData' ? userData : '/unused') }
  const context = vm.createContext({
    exports: {},
    __dirname,
    process,
    console,
    setTimeout,
    clearTimeout,
    require: (id: string) => {
      if (id === 'electron') return { app, dialog: {}, BrowserWindow: class {} }
      if (id === 'node:fs') return fs
      if (id === 'node:path') return path
      if (id === 'node:crypto') return require('node:crypto')
      if (id === './i18n') return require(path.join(__dirname, 'i18n'))
      if (id === './exclusive-operation') return require(path.join(__dirname, 'exclusive-operation'))
      if (id === './world-safety') return require(path.join(__dirname, 'world-safety'))
      if (id === './renderer-load') return { loadRenderer: async () => {} }
      if (id === './data-lock') return { acquireDataRootLock: () => { throw new Error('no lock in test') } }
      if (id === './sim-process') {
        return {
          activeSim: () => null,
          checkpointActiveSim: async () => false,
          quiesceRecoveredDataRoot: async () => {},
          startSim: async () => { throw new Error('no sim in test') },
          startSimWithDataRootLock: async () => { throw new Error('no sim in test') },
          stopSim: async () => {},
        }
      }
      if (id === './settings') {
        const settingsContext = vm.createContext({
          exports: {},
          __dirname,
          process,
          console,
          require: (inner: string) => {
            if (inner === 'electron') return { app }
            if (inner === './world-safety') return require(path.join(__dirname, 'world-safety'))
            if (inner === 'node:fs') return fs
            if (inner === 'node:path') return path
            throw new Error(`unexpected require in settings: ${inner}`)
          },
        })
        vm.runInContext(fs.readFileSync(path.join(__dirname, 'settings.js'), 'utf8'), settingsContext)
        return settingsContext.exports
      }
      throw new Error(`unexpected require in ipc: ${id}`)
    },
  })
  vm.runInContext(readFileSync(path.join(__dirname, 'ipc.js'), 'utf8'), context)
  ;(vm.runInContext('registerIpc', context) as (ipc: unknown, getWindow: () => null) => void)(
    {
      handle: (channel: string, handler: (...args: unknown[]) => Promise<unknown>) => {
        handlers[channel] = handler
      },
    },
    () => null,
  )
  return handlers
}

function withUserData(run: (userData: string) => Promise<void>): Promise<void> {
  const userData = mkdtempSync(path.join(tmpdir(), 'thb-save-folder-ipc-'))
  mkdirSync(userData, { recursive: true })
  writeFileSync(path.join(userData, 'settings.json'), JSON.stringify({}))
  return run(userData).finally(() => rmSync(userData, { recursive: true, force: true }))
}

test('moving the save folder without a folder says what to choose, not a type error', () =>
  withUserData(async (userData) => {
    const migrate = loadIpc(userData)['world:migrateDataRoot']
    for (const payload of [undefined, {}, { targetDir: 42 }, { targetDir: '' }]) {
      await assert.rejects(migrate({}, payload), /choose a save folder/)
    }
  }))

test('moving the save folder refuses a relative folder', () =>
  withUserData(async (userData) => {
    const migrate = loadIpc(userData)['world:migrateDataRoot']
    await assert.rejects(migrate({}, { targetDir: 'saves/mine' }), /absolute/)
  }))
