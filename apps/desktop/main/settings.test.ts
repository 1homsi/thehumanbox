import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import * as fs from 'node:fs'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import test from 'node:test'
import * as vm from 'node:vm'

// settings.ts and ipc.ts import Electron, which a plain Node test cannot load.
// Each runs in its own vm context with a fake `electron` and the real modules
// it depends on, as the window tests do.

const BOM = Buffer.from([0xef, 0xbb, 0xbf])

type Exports = Record<string, (...args: never[]) => unknown>

/** Load a compiled main-process module into a fresh context, with `electron` faked. */
function loadMain(
  file: string,
  userData: string,
  extra: (id: string) => unknown = () => undefined,
): Exports {
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
      if (id === './settings') return loadMain('settings.js', userData)
      const stub = extra(id)
      if (stub !== undefined) return stub
      throw new Error(`unexpected require in ${file}: ${id}`)
    },
  })
  vm.runInContext(readFileSync(path.join(__dirname, file), 'utf8'), context)
  return context.exports as Exports
}

function withUserData(run: (userData: string) => void | Promise<void>): Promise<void> {
  const userData = mkdtempSync(path.join(tmpdir(), 'thb-settings-'))
  const finish = () => rmSync(userData, { recursive: true, force: true })
  return Promise.resolve()
    .then(() => run(userData))
    .finally(finish)
}

function writeSettings(userData: string, body: Buffer | string): void {
  mkdirSync(userData, { recursive: true })
  writeFileSync(path.join(userData, 'settings.json'), body)
}

function loadSettings(userData: string): { tickMs: number; populationCap: number } {
  return (loadMain('settings.js', userData) as { loadSettings: () => { tickMs: number; populationCap: number } }).loadSettings()
}

function ipcHandlers(userData: string): Record<string, (...args: unknown[]) => Promise<unknown>> {
  const handlers: Record<string, (...args: unknown[]) => Promise<unknown>> = {}
  const ipc = {
    handle: (channel: string, handler: (...args: unknown[]) => Promise<unknown>) => {
      handlers[channel] = handler
    },
  }
  const ipcModule = loadMain('ipc.js', userData, (id) => {
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
    return undefined
  })
  ;(ipcModule as { registerIpc: (ipc: unknown, getWindow: () => null) => void }).registerIpc(ipc, () => null)
  return handlers
}

test('a settings file that starts with a byte order mark still loads', () =>
  withUserData((userData) => {
    const json = Buffer.from(JSON.stringify({ tickMs: 250, populationCap: 800 }))
    writeSettings(userData, Buffer.concat([BOM, json]))
    const settings = loadSettings(userData)
    assert.equal(settings.tickMs, 250)
    assert.equal(settings.populationCap, 800)
  }))

test('a numeric setting written as a string keeps its value instead of the minimum', () =>
  withUserData((userData) => {
    writeSettings(userData, JSON.stringify({ tickMs: '250', populationCap: '800' }))
    const settings = loadSettings(userData)
    assert.equal(settings.tickMs, 250)
    assert.equal(settings.populationCap, 800)
  }))

test('a save folder that is not an absolute path is refused, not resolved against the working directory', () =>
  withUserData((userData) => {
    writeSettings(userData, JSON.stringify({ saveLocationOverride: 'saves/mine' }))
    assert.throws(() => loadSettings(userData), /absolute/)
  }))

test('a save folder that is not a string is refused with a clear message', () =>
  withUserData((userData) => {
    writeSettings(userData, JSON.stringify({ saveLocationOverride: 42 }))
    assert.throws(() => loadSettings(userData), /save folder/)
  }))

test('an empty save folder is refused instead of pointing the game at the working directory', () =>
  withUserData((userData) => {
    writeSettings(userData, JSON.stringify({ saveLocationOverride: '' }))
    assert.throws(() => loadSettings(userData), /absolute/)
  }))

test('a settings file that is valid JSON but not an object is refused, not replaced by defaults', () =>
  withUserData((userData) => {
    // Defaults would point the game at the default save folder, which can
    // orphan a world kept in a custom one.
    writeSettings(userData, JSON.stringify([1, 2, 3]))
    assert.throws(() => loadSettings(userData), /corrupt/)
  }))

test('settings:set refuses a payload that is not an object and leaves settings.json unchanged', () =>
  withUserData(async (userData) => {
    writeSettings(userData, JSON.stringify({ tickMs: 250, populationCap: 800 }))
    const before = readFileSync(path.join(userData, 'settings.json'), 'utf8')
    const handler = ipcHandlers(userData)['settings:set']
    for (const payload of ['garbage', null, undefined, 42, ['x']]) {
      await assert.rejects(handler({}, payload), /settings must be an object/)
    }
    assert.equal(readFileSync(path.join(userData, 'settings.json'), 'utf8'), before)
  }))

test('settings:set refuses a save folder that is not an absolute path', () =>
  withUserData(async (userData) => {
    writeSettings(userData, JSON.stringify({ tickMs: 250 }))
    const handler = ipcHandlers(userData)['settings:set']
    await assert.rejects(handler({}, { tickMs: 250, saveLocationOverride: 'relative' }), /absolute/)
  }))
