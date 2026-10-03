import { lazy, type ComponentType } from 'react'
import { reloadAppSafely } from '../simulation/worldSource'

const RELOAD_KEY = 'thb-chunk-reload-at'
const RELOAD_COOLDOWN_MS = 15_000

function isChunkLoadError(err: unknown): boolean {
  if (!err) return false
  const msg = err instanceof Error ? err.message : String(err)
  return /Failed to fetch dynamically imported module|Importing a module script failed|Failed to load module script|Loading chunk \d+ failed/i.test(
    msg,
  )
}

function maybeReload(onFailure: () => void = () => {}) {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || '0')
    const now = Date.now()
    if (now - last < RELOAD_COOLDOWN_MS) return false
    sessionStorage.setItem(RELOAD_KEY, String(now))
    return reloadAppSafely({
      onFailure: () => {
        try {
          sessionStorage.removeItem(RELOAD_KEY)
        } catch {
          // Storage may disappear while the checkpoint is pending.
        }
        onFailure()
      },
      failureMessage: 'could not checkpoint the current world; renderer update was cancelled safely',
    })
  } catch {
    return false
  }
}

export function loadWithChunkRecovery<T>(factory: () => Promise<T>): Promise<T> {
  return factory().catch((err) => {
    if (!isChunkLoadError(err)) throw err
    return new Promise<T>((_resolve, reject) => {
      // The callback exists before requesting reload: checkpoint failure may
      // arrive synchronously or asynchronously. Either must release Suspense.
      if (!maybeReload(() => reject(err))) reject(err)
    })
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithRetry<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(() => loadWithChunkRecovery(factory))
}

if (typeof window !== 'undefined') {
  window.addEventListener('error', (e) => {
    if (isChunkLoadError(e?.error) || isChunkLoadError(e?.message)) maybeReload()
  })
  window.addEventListener('unhandledrejection', (e) => {
    if (isChunkLoadError(e?.reason)) maybeReload()
  })
}
