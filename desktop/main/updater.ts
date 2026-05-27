import { app, BrowserWindow, dialog } from 'electron'
import { autoUpdater, UpdateInfo } from 'electron-updater'
import { loadSettings } from './settings'

export function initUpdater(getWindow: () => BrowserWindow | null): void {
  if (!app.isPackaged) return
  const s = loadSettings()
  if (!s.autoUpdate) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    const win = getWindow()
    if (win) {
      win.webContents.send('updater:available', { version: info.version, releaseDate: info.releaseDate })
    }
  })

  autoUpdater.on('update-downloaded', async (info: UpdateInfo) => {
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
    console.error('[updater]', err)
  })

  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    console.error('[updater] check failed:', err)
  })

  setInterval(
    () => {
      autoUpdater.checkForUpdates().catch(() => {})
    },
    6 * 60 * 60 * 1000,
  )
}
