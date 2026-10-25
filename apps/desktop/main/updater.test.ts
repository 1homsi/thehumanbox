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
function harness(
  onCheck: (updater: FakeUpdater) => Promise<{ updateInfo: { version: string } } | null> = async () => null,
  {
    autoUpdate = false,
    now = (): number => 0,
    promptFails = false,
    settingsUnreadable = (): boolean => false,
    promptResponse = 1,
  }: {
    autoUpdate?: boolean
    now?: () => number
    promptFails?: boolean
    settingsUnreadable?: () => boolean
    promptResponse?: number
  } = {},
) {
  const autoUpdater = new EventEmitter() as FakeUpdater
  autoUpdater.checkForUpdates = () => onCheck(autoUpdater)
  const quits: number[] = []
  autoUpdater.quitAndInstall = () => {
    quits.push(1)
  }
  const prompts: string[] = []
  const intervals: Array<() => void> = []
  const app = Object.assign(new EventEmitter(), {
    isPackaged: true,
    getPath: () => '/tmp/thehumanbox-test',
    quit() {},
  })
  const dialog = {
    showMessageBox: async (options: { message: string }) => {
      prompts.push(options.message)
      if (promptFails) throw new Error('no display to show the prompt on')
      return { response: promptResponse }
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
    setInterval: (callback: () => void) => {
      intervals.push(callback)
      return 0
    },
    Date: { now },
    require: (id: string) => {
      if (id === 'electron') return { app, BrowserWindow: class {}, dialog }
      if (id === 'electron-updater') return { autoUpdater }
      if (id === './settings') {
        return {
          loadSettings: () => {
            // Stands in for settings.json being edited into invalid JSON mid-session.
            if (settingsUnreadable()) throw new Error('settings.json is corrupt')
            return { autoUpdate }
          },
        }
      }
      if (id === './i18n') return require(path.join(__dirname, 'i18n'))
      if (id === './exclusive-operation') return require(path.join(__dirname, 'exclusive-operation'))
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
  return { context, app, autoUpdater, prompts, intervals, quits }
}

const flush = () => new Promise((resolve) => setImmediate(resolve))

test('an update prompt that cannot be shown does not escape as an unhandled rejection', async () => {
  // The download event listener is async and EventEmitter drops its promise,
  // so a rejected prompt used to surface only as an unhandled rejection.
  const unhandled: unknown[] = []
  const record = (reason: unknown) => { unhandled.push(reason) }
  process.on('unhandledRejection', record)
  try {
    const { autoUpdater } = harness(undefined, { promptFails: true })
    autoUpdater.emit('update-downloaded', { version: '1.2.3', downloadedFile: '/tmp/a.zip' })
    await new Promise((resolve) => setTimeout(resolve, 20))
    assert.deepEqual(unhandled, [])
  } finally {
    process.off('unhandledRejection', record)
  }
})

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

test('focusing the window checks again once the last check is ten minutes old', async () => {
  let checks = 0
  let clock = 0
  const { app } = harness(
    async () => {
      checks++
      return null
    },
    { autoUpdate: true, now: () => clock },
  )
  assert.equal(checks, 1, 'checks at startup')
  clock = 9 * 60 * 1000
  app.emit('browser-window-focus')
  assert.equal(checks, 1, 'a recent check is not repeated')
  clock = 10 * 60 * 1000
  app.emit('browser-window-focus')
  assert.equal(checks, 2)
})

// An exception on a timer or a window event reaches the main process's
// uncaughtException handler, which stops the simulation and quits the game. A
// settings.json edited into invalid JSON while the game runs must not do that.

test('focusing the window while settings.json is unreadable does not throw', () => {
  let unreadable = false
  let clock = 0
  const { app } = harness(undefined, {
    autoUpdate: true,
    now: () => clock,
    settingsUnreadable: () => unreadable,
  })
  unreadable = true
  // A focus only reads the settings once the last check is ten minutes old.
  clock = 10 * 60 * 1000
  assert.doesNotThrow(() => app.emit('browser-window-focus'))
})

test('the update timer while settings.json is unreadable does not throw', async () => {
  let unreadable = false
  const { intervals } = harness(undefined, { autoUpdate: true, settingsUnreadable: () => unreadable })
  assert.equal(intervals.length, 1)
  unreadable = true
  assert.doesNotThrow(() => intervals[0]())
})

test('starting while settings.json is unreadable does not throw out of the updater', () => {
  assert.doesNotThrow(() => harness(undefined, { settingsUnreadable: () => true }))
})

test('checks resume once a settings file that was unreadable at startup reads again', async () => {
  // The timer and the focus check are registered even when the first read
  // fails; a registration skipped at startup would stay skipped until a restart.
  let unreadable = true
  let checks = 0
  const { intervals } = harness(
    async () => {
      checks++
      return null
    },
    { autoUpdate: true, settingsUnreadable: () => unreadable },
  )
  await flush()
  assert.equal(checks, 0, 'no check while the file is unreadable')
  assert.equal(intervals.length, 1, 'the timer is registered regardless')

  unreadable = false
  intervals[0]()
  await flush()
  assert.equal(checks, 1)
})

// Installing quits the app. A save-folder move or a reset is running in the
// same process, and quitting in the middle of it leaves the migration or reset
// to recovery at the next start. The install waits for that operation.

async function withOperationRunning(run: () => Promise<void>): Promise<void> {
  const exclusive = require(path.join(__dirname, 'exclusive-operation')) as {
    runExclusiveDesktopOperation: (name: string, operation: () => Promise<void>) => Promise<void>
  }
  let release: () => void = () => {}
  const running = exclusive.runExclusiveDesktopOperation(
    'move the save folder',
    () => new Promise<void>((resolve) => { release = resolve }),
  )
  try {
    await run()
  } finally {
    release()
    await running
  }
}

test('installing a downloaded update waits while a save-folder move is running', async () => {
  const { context, autoUpdater, quits } = harness()
  autoUpdater.emit('update-downloaded', { version: '1.2.3', downloadedFile: '/tmp/a.zip' })
  await flush()
  await withOperationRunning(async () => {
    const result = vm.runInContext('installDownloadedUpdate()', context)
    assert.match(result.message ?? '', /save or simulation change/)
    await flush()
    assert.equal(quits.length, 0)
  })
})

test('Restart and update in the prompt is refused with a reason while a save-folder move is running', async () => {
  const { autoUpdater, prompts, quits } = harness(undefined, { promptResponse: 0 })
  await withOperationRunning(async () => {
    autoUpdater.emit('update-downloaded', { version: '1.2.3', downloadedFile: '/tmp/a.zip' })
    await new Promise((resolve) => setTimeout(resolve, 20))
    assert.equal(quits.length, 0)
    assert.ok(prompts.some((message) => /save or simulation change/.test(message)), `prompts: ${prompts.join(' | ')}`)
  })
})
