import { lazy, useEffect, type ComponentType } from 'react'
import { t } from '../i18n'
import { reloadAppSafely } from '../simulation/worldSource'
import { reportStaleBuild } from './staleBuild'

const RELOAD_KEY = 'thb-chunk-reload-at'
const RELOAD_COOLDOWN_MS = 15_000

function isChunkLoadError(err: unknown): boolean {
  if (!err) return false
  const msg = err instanceof Error ? err.message : String(err)
  return /Failed to fetch dynamically imported module|Importing a module script failed|Failed to load module script|Loading chunk \d+ failed|Unable to preload CSS/i.test(
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
      failureMessage: t('dialogs.worldNotice.checkpointRenderer'),
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

export function loadOrReportStale<T>(
  factory: () => Promise<{ default: T }>,
  fallback: T,
): Promise<{ default: T }> {
  return factory().catch((err) => {
    if (!isChunkLoadError(err)) throw err
    return { default: fallback }
  })
}

type ChunkFactory = () => Promise<unknown>

const prefetchQueue: ChunkFactory[] = []
let worldReady = false
let draining = false

function whenIdle(run: () => void) {
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(run, { timeout: 4000 })
  else window.setTimeout(run, 200)
}

function drainPrefetchQueue() {
  if (draining || !worldReady || typeof window === 'undefined') return
  const next = prefetchQueue.shift()
  if (!next) return
  draining = true
  whenIdle(() => {
    void next()
      .catch(() => undefined)
      .finally(() => {
        draining = false
        drainPrefetchQueue()
      })
  })
}

export function prefetchLazyChunks() {
  worldReady = true
  drainPrefetchQueue()
}

export function pendingPrefetchCount() {
  return prefetchQueue.length
}

function MissingChunk() {
  useEffect(() => {
    reportStaleBuild()
  }, [])
  return null
}

export interface LazyOptions {
  onMissingChunk?: 'notice' | 'reload'
  prefetch?: boolean
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  { onMissingChunk = 'notice', prefetch = true }: LazyOptions = {},
) {
  if (prefetch) {
    prefetchQueue.push(factory)
    drainPrefetchQueue()
  }
  if (onMissingChunk === 'reload') return lazy(() => loadWithChunkRecovery(factory))
  return lazy(() => loadOrReportStale<T>(factory, MissingChunk as unknown as T))
}

if (typeof window !== 'undefined') {
  window.addEventListener('error', (e) => {
    if (isChunkLoadError(e?.error) || isChunkLoadError(e?.message)) maybeReload()
  })
  window.addEventListener('unhandledrejection', (e) => {
    if (isChunkLoadError(e?.reason)) maybeReload()
  })
  window.addEventListener('thb-world-ready', prefetchLazyChunks, { once: true })
}
