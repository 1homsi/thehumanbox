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
  }

  on(channel: 'updater:available' | 'updater:downloaded', cb: (payload: unknown) => void): () => void
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
  },

  on(channel, cb) {
    const handler = (_e: unknown, payload: unknown) => cb(payload)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  },
}

contextBridge.exposeInMainWorld('thbDesktop', bridge)
