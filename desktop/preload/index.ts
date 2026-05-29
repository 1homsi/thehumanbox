import { contextBridge, ipcRenderer } from 'electron'

export interface DesktopBridge {
  isDesktop: true
  platform: NodeJS.Platform
  appVersion: string

  settings: {
    get(): Promise<unknown>
    set(next: unknown): Promise<unknown>
  }

  sim: {
    status(): Promise<{ running: boolean; port: number | null }>
    restart(): Promise<{ running: boolean; port: number | null; error?: string }>
  }

  app: {
    reload(): Promise<void>
    notify(payload: { title: string; body: string }): Promise<void>
    trayToggle(): Promise<void>
    screenshot(): Promise<string | null>
    openLogs(): Promise<void>
    openWorlds(): Promise<void>
    applyAutoLaunch(): Promise<void>
    pickSaveDir(): Promise<string | null>
  }

  world: {
    importFromRemote(payload: { hash: string; remoteUrl: string }): Promise<{ running: boolean; port: number }>
  }

  on(
    channel:
      | 'updater:available'
      | 'updater:downloaded'
      | 'menu:openSettings'
      | 'app:visibility',
    cb: (payload: unknown) => void,
  ): () => void
}

const bridge: DesktopBridge = {
  isDesktop: true,
  platform: process.platform,
  appVersion: process.env.npm_package_version ?? '',

  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (next) => ipcRenderer.invoke('settings:set', next),
  },

  sim: {
    status: () => ipcRenderer.invoke('sim:status'),
    restart: () => ipcRenderer.invoke('sim:restart'),
  },

  app: {
    reload: () => ipcRenderer.invoke('app:reload'),
    notify: (payload) => ipcRenderer.invoke('app:notify', payload),
    trayToggle: () => ipcRenderer.invoke('app:trayToggle'),
    screenshot: () => ipcRenderer.invoke('app:screenshot'),
    openLogs: () => ipcRenderer.invoke('app:openLogs'),
    openWorlds: () => ipcRenderer.invoke('app:openWorlds'),
    applyAutoLaunch: () => ipcRenderer.invoke('app:applyAutoLaunch'),
    pickSaveDir: () => ipcRenderer.invoke('app:pickSaveDir'),
  },

  world: {
    importFromRemote: (payload) => ipcRenderer.invoke('world:importFromRemote', payload),
  },

  on(channel, cb) {
    const handler = (_e: unknown, payload: unknown) => cb(payload)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  },
}

contextBridge.exposeInMainWorld('thbDesktop', bridge)
