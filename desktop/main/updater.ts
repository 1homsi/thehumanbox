import { app, BrowserWindow, dialog } from 'electron'
import { autoUpdater, UpdateInfo } from 'electron-updater'
import { loadSettings } from './settings'

export type UpdateCheckStatus = 'checking' | 'available' | 'downloaded' | 'up-to-date' | 'unsupported' | 'error'

export interface UpdateCheckResult {
  status: UpdateCheckStatus
  version?: string
  releaseDate?: string
  message?: string
}

let initialized = false
let latestStatus: UpdateCheckResult = { status: 'up-to-date' }

export function initUpdater(getWindow: () => BrowserWindow | null): void {
  if (initialized) return
  initialized = true

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info: UpdateInfo) => {
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

  autoUpdater.on('update-downloaded', async (info: UpdateInfo) => {
    latestStatus = {
      status: 'downloaded',
      version: info.version,
      releaseDate: info.releaseDate,
    }
    const win = getWindow()
    if (win) {
      win.webContents.send('updater:downloaded', { version: info.version })
    }
    const { response } = await dialog.showMessageBox({
      type: 'info',
      buttons: ['Restart and update', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Update ready',
      message: `Version ${info.version} is ready to install.`,
      detail: 'The app will restart and apply the update.',
    })
    if (response === 0) {
      setImmediate(() => autoUpdater.quitAndInstall())
    }
  })

  autoUpdater.on('error', (err) => {
    latestStatus = { status: 'error', message: err.message }
    console.error('[updater]', err)
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

  setInterval(
    () => {
      if (!loadSettings().autoUpdate) return
      void checkForUpdatesNow().catch(() => {})
    },
    6 * 60 * 60 * 1000,
  )
}

export async function checkForUpdatesNow(): Promise<UpdateCheckResult> {
  if (!app.isPackaged) {
    latestStatus = {
      status: 'unsupported',
      message: 'Update checks are only available in packaged builds.',
    }
    return latestStatus
  }

  latestStatus = { status: 'checking' }
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
    latestStatus = { status: 'error', message }
    console.error('[updater] check failed:', err)
    return latestStatus
  }
}
