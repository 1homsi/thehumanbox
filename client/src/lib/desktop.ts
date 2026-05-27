export type SimMode = 'local' | 'remote'
export type ModelProvider = 'groq' | 'openai' | 'anthropic' | 'ollama' | 'llama-cpp' | 'none'

export interface DesktopSettings {
  mode: SimMode
  remoteUrl: string
  tickMs: number
  model: {
    provider: ModelProvider
    apiUrl: string
    apiKey: string
    modelName: string
  }
  saveLocationOverride: string | null
  autoUpdate: boolean
}

export interface SimStatus {
  running: boolean
  port: number | null
  error?: string
}

export interface UpdateInfo {
  version: string
  releaseDate?: string
}

export interface DesktopBridge {
  isDesktop: true
  platform: string
  appVersion: string
  settings: {
    get(): Promise<DesktopSettings>
    set(next: DesktopSettings): Promise<DesktopSettings>
  }
  sim: {
    status(): Promise<SimStatus>
    restart(): Promise<SimStatus>
  }
  app: {
    reload(): Promise<void>
  }
  world: {
    importFromRemote(payload: { hash: string; remoteUrl: string }): Promise<SimStatus>
  }
  on(
    channel: 'updater:available' | 'updater:downloaded' | 'menu:openSettings',
    cb: (payload: UpdateInfo | null) => void,
  ): () => void
}

declare global {
  interface Window {
    thbDesktop?: DesktopBridge
  }
}

export function getDesktop(): DesktopBridge | null {
  if (typeof window === 'undefined') return null
  return window.thbDesktop ?? null
}

export function isDesktop(): boolean {
  return !!getDesktop()
}
