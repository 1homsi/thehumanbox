import { lazy, type ComponentType } from 'react'

const RELOAD_KEY = 'thb-chunk-reload-at'
const RELOAD_COOLDOWN_MS = 15_000

function isChunkLoadError(err: unknown): boolean {
  if (!err) return false
  const msg = err instanceof Error ? err.message : String(err)
  return /Failed to fetch dynamically imported module|Importing a module script failed|Failed to load module script|Loading chunk \d+ failed/i.test(
    msg,
  )
}

function maybeReload() {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || '0')
    const now = Date.now()
    if (now - last < RELOAD_COOLDOWN_MS) return false
    sessionStorage.setItem(RELOAD_KEY, String(now))
    window.location.reload()
    return true
  } catch {
    return false
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithRetry<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(() =>
    factory().catch((err) => {
      if (isChunkLoadError(err)) {
        if (maybeReload()) {
          return new Promise<{ default: T }>(() => {
            /* hang until reload */
          })
        }
      }
      throw err
    }),
  )
}

if (typeof window !== 'undefined') {
  window.addEventListener('error', (e) => {
    if (isChunkLoadError(e?.error) || isChunkLoadError(e?.message)) maybeReload()
  })
  window.addEventListener('unhandledrejection', (e) => {
    if (isChunkLoadError(e?.reason)) maybeReload()
  })
}
