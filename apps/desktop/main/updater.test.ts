import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import test from 'node:test'
import * as vm from 'node:vm'

function harness(checkResult: { version: string } | null = null) {
  const autoUpdater = new EventEmitter() as EventEmitter & {
    autoDownload?: boolean
    autoInstallOnAppQuit?: boolean
    checkForUpdates: () => Promise<{ updateInfo: { version: string } } | null>
    quitAndInstall: () => void
  }
  autoUpdater.checkForUpdates = async () => (checkResult ? { updateInfo: { version: checkResult.version } } : null)
  autoUpdater.quitAndInstall = () => {}
  const prompts: string[] = []
  const app = { isPackaged: true, getPath: () => '/tmp/thehumanbox-test', quit() {} }
  const dialog = {
    showMessageBox: async (options: { title: string; message: string }) => {
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
  return { context, autoUpdater, prompts }
}

const flush = () => new Promise((resolve) => setImmediate(resolve))

test('a cached update re-emitted for the same version prompts once', async () => {
  const { context, autoUpdater, prompts } = harness()
  vm.runInContext('initUpdater(() => null)', context)
  const info = { version: '1.2.3', downloadedFile: '/tmp/update.zip' }
  autoUpdater.emit('update-downloaded', info)
  autoUpdater.emit('update-downloaded', info)
  await flush()
  assert.equal(prompts.length, 1)
})

test('a newer version gets its own prompt after an earlier one was dismissed', async () => {
  const { context, autoUpdater, prompts } = harness()
  vm.runInContext('initUpdater(() => null)', context)
  autoUpdater.emit('update-downloaded', { version: '1.2.3', downloadedFile: '/tmp/a.zip' })
  autoUpdater.emit('update-downloaded', { version: '1.2.4', downloadedFile: '/tmp/b.zip' })
  await flush()
  assert.equal(prompts.length, 2)
})

test('a manual check keeps a held downloaded update instead of reporting up-to-date', async () => {
  const { context, autoUpdater } = harness({ version: '1.2.3' })
  vm.runInContext('initUpdater(() => null)', context)
  autoUpdater.emit('update-downloaded', { version: '1.2.3', downloadedFile: '/tmp/a.zip' })
  await flush()
  const result = await vm.runInContext('checkForUpdatesNow()', context)
  assert.equal(result.status, 'downloaded')
  assert.equal(result.version, '1.2.3')
})
