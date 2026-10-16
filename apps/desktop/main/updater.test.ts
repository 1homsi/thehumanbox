import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import test from 'node:test'
import * as vm from 'node:vm'

type FakeUpdater = EventEmitter & {
  checkForUpdates: () => Promise<{ updateInfo: { version: string } } | null>
  quitAndInstall: () => void
}

// Loads the compiled updater in its own context, so each test starts with a
// fresh module state (the `initialized` flag is per context).
function harness(onCheck: (updater: FakeUpdater) => Promise<{ updateInfo: { version: string } } | null> = async () => null) {
  const autoUpdater = new EventEmitter() as FakeUpdater
  autoUpdater.checkForUpdates = () => onCheck(autoUpdater)
  autoUpdater.quitAndInstall = () => {}
  const prompts: string[] = []
  const app = { isPackaged: true, getPath: () => '/tmp/thehumanbox-test', quit() {} }
  const dialog = {
    showMessageBox: async (options: { message: string }) => {
      prompts.push(options.message)
      return { response: 1 }
    },
  }
  const context = vm.createContext({
    exports: {},
    __dirname,
    process,
    console: { error() {}, warn() {}, log() {} },
    setTimeout,
    clearTimeout,
    setImmediate,
    setInterval: () => 0,
    require: (id: string) => {
      if (id === 'electron') return { app, BrowserWindow: class {}, dialog }
      if (id === 'electron-updater') return { autoUpdater }
      if (id === './settings') return { loadSettings: () => ({ autoUpdate: false }) }
      if (id === './mac-unsigned-install') {
        return {
          appBundleFromExe: () => null,
          hasDeveloperIdSignature: () => true,
          startUnsignedMacInstall: () => ({ started: false }),
        }
      }
      return {}
    },
  })
  vm.runInContext(readFileSync(path.join(__dirname, 'updater.js'), 'utf8'), context)
  vm.runInContext('initUpdater(() => null)', context)
  return { context, autoUpdater, prompts }
}

const flush = () => new Promise((resolve) => setImmediate(resolve))

test('a cached update re-emitted after its prompt was answered prompts once', async () => {
  const { autoUpdater, prompts } = harness()
  const info = { version: '1.2.3', downloadedFile: '/tmp/update.zip' }
  autoUpdater.emit('update-downloaded', info)
  await flush()
  autoUpdater.emit('update-downloaded', info)
  await flush()
  assert.equal(prompts.length, 1)
})

test('a newer version gets its own prompt', async () => {
  const { autoUpdater, prompts } = harness()
  autoUpdater.emit('update-downloaded', { version: '1.2.3', downloadedFile: '/tmp/a.zip' })
  await flush()
  autoUpdater.emit('update-downloaded', { version: '1.2.4', downloadedFile: '/tmp/b.zip' })
  await flush()
  assert.equal(prompts.length, 2)
})

test('a manual check that finds the held version keeps the download', async () => {
  const { context, autoUpdater, prompts } = harness(async (updater) => {
    updater.emit('update-available', { version: '1.2.3' })
    return { updateInfo: { version: '1.2.3' } }
  })
  autoUpdater.emit('update-downloaded', { version: '1.2.3', downloadedFile: '/tmp/a.zip' })
  await flush()
  const result = await vm.runInContext('checkForUpdatesNow()', context)
  assert.equal(result.status, 'downloaded')
  assert.equal(prompts.length, 1)
})

test('a failed check reports its error but keeps a held download installable', async () => {
  const { context, autoUpdater } = harness(async () => {
    throw new Error('offline')
  })
  autoUpdater.emit('update-downloaded', { version: '1.2.3', downloadedFile: '/tmp/a.zip' })
  await flush()
  const failed = await vm.runInContext('checkForUpdatesNow()', context)
  assert.equal(failed.status, 'error')
  const install = vm.runInContext('installDownloadedUpdate()', context)
  assert.equal(install.status, 'downloaded')
})
