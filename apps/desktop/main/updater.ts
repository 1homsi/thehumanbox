import { app, BrowserWindow, dialog } from 'electron'
import { autoUpdater, UpdateDownloadedEvent, UpdateInfo } from 'electron-updater'
import { loadSettings } from './settings'
import { appBundleFromExe, hasDeveloperIdSignature, startUnsignedMacInstall } from './mac-unsigned-install'

export type UpdateCheckStatus = 'checking' | 'available' | 'downloaded' | 'up-to-date' | 'unsupported' | 'error'

export interface UpdateCheckResult {
  status: UpdateCheckStatus
  version?: string
  releaseDate?: string
  message?: string
}

// A release ships on every merge, so check often; returning to the window
// checks too, unless a check ran a few minutes ago.
const CHECK_INTERVAL_MS = 30 * 60 * 1000
const FOCUS_CHECK_MIN_GAP_MS = 10 * 60 * 1000

let initialized = false
let lastCheckAt = 0
let latestStatus: UpdateCheckResult = { status: 'up-to-date' }
let downloadedFile: string | null = null
let promptedVersion: string | null = null

/** Unsigned macOS builds can't use Squirrel.Mac; see mac-unsigned-install.ts. */
function usesUnsignedMacInstall(): boolean {
  if (process.platform !== 'darwin' || !app.isPackaged) return false
  const bundle = appBundleFromExe(process.execPath)
  return bundle !== null && !hasDeveloperIdSignature(bundle)
}

function installNow(): UpdateCheckResult {
  if (!usesUnsignedMacInstall()) {
    setImmediate(() => autoUpdater.quitAndInstall())
    return latestStatus
  }
  if (!downloadedFile) {
    return { ...latestStatus, message: 'The downloaded update file is missing. Check for updates again.' }
  }
  const result = startUnsignedMacInstall(downloadedFile, process.execPath, process.pid)
  if (!result.started) {
    const message = result.message ?? 'The update could not be installed.'
    void dialog.showMessageBox({ type: 'error', title: 'Update failed', message: 'The update could not be installed.', detail: message })
    return { ...latestStatus, message }
  }
  setImmediate(() => app.quit())
  return latestStatus
}

export function initUpdater(getWindow: () => BrowserWindow | null): void {
  if (initialized) return
  initialized = true

  autoUpdater.autoDownload = true
  // Squirrel.Mac can't install over an unsigned app, so those builds install
  // explicitly from the "Restart and update" prompt instead of on quit.
  autoUpdater.autoInstallOnAppQuit = !usesUnsignedMacInstall()

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    // electron-updater announces a cached version again before it reuses the
    // installer; keep the held download instead of showing "downloading" again.
    if (latestStatus.status === 'downloaded' && latestStatus.version === info.version) return
    latestStatus = {
      status: 'available',
      version: info.version,
      releaseDate: info.releaseDate,
    }
    const win = getWindow()
    if (win) {
      win.webContents.send('updater:available', {
        version: info.version,
        releaseDate: info.releaseDate,
      })
    }
  })

  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    latestStatus = {
      status: 'up-to-date',
      version: info.version,
      releaseDate: info.releaseDate,
    }
  })

  autoUpdater.on('update-downloaded', async (info: UpdateDownloadedEvent) => {
    downloadedFile = info.downloadedFile
    latestStatus = {
      status: 'downloaded',
      version: info.version,
      releaseDate: info.releaseDate,
    }
    const win = getWindow()
    if (win) {
      win.webContents.send('updater:downloaded', { version: info.version })
    }
    // electron-updater re-emits this for a cached installer on every check, so
    // ask once per version. A newer version still gets its own prompt.
    if (promptedVersion === info.version) return
    promptedVersion = info.version
    const { response } = await dialog.showMessageBox({
      type: 'info',
      buttons: ['Restart and update', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Update ready',
      message: `Version ${info.version} is ready to install.`,
      detail: 'The app will restart and apply the update.',
    })
    if (response === 0) installNow()
  })

  autoUpdater.on('error', (err) => {
    // A failed check does not invalidate an installer that is already held.
    if (latestStatus.status !== 'downloaded') latestStatus = { status: 'error', message: err.message }
    console.error('[updater]', err)
    getWindow()?.webContents.send('updater:error', { message: err.message })
  })

  if (!app.isPackaged) {
    latestStatus = {
      status: 'unsupported',
      message: 'Update checks are only available in packaged builds.',
    }
    return
  }

  const s = loadSettings()
  if (!s.autoUpdate) return

  void checkForUpdatesNow()

  setInterval(() => {
    if (!loadSettings().autoUpdate) return
    void checkForUpdatesNow().catch(() => {})
  }, CHECK_INTERVAL_MS)

  app.on('browser-window-focus', () => {
    if (Date.now() - lastCheckAt < FOCUS_CHECK_MIN_GAP_MS) return
    if (!loadSettings().autoUpdate) return
    void checkForUpdatesNow().catch(() => {})
  })
}

export async function checkForUpdatesNow(): Promise<UpdateCheckResult> {
  if (!app.isPackaged) {
    latestStatus = {
      status: 'unsupported',
      message: 'Update checks are only available in packaged builds.',
    }
    return latestStatus
  }

  lastCheckAt = Date.now()
  // A downloaded update stays held during a check; resetting it would hide the install action.
  if (latestStatus.status !== 'downloaded') latestStatus = { status: 'checking' }
  try {
    const result = await autoUpdater.checkForUpdates()
    if (latestStatus.status !== 'checking') return latestStatus
    const info = result?.updateInfo
    latestStatus = {
      status: 'up-to-date',
      version: info?.version,
      releaseDate: info?.releaseDate,
    }
    return latestStatus
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const failure: UpdateCheckResult = { status: 'error', message }
    if (latestStatus.status !== 'downloaded') latestStatus = failure
    console.error('[updater] check failed:', err)
    return failure
  }
}

export function installDownloadedUpdate(): UpdateCheckResult {
  if (!app.isPackaged) {
    latestStatus = {
      status: 'unsupported',
      message: 'Update installs are only available in packaged builds.',
    }
    return latestStatus
  }
  if (latestStatus.status !== 'downloaded') {
    return {
      ...latestStatus,
      message: latestStatus.message ?? 'No downloaded update is ready to install.',
    }
  }
  return installNow()
}
