// @vitest-environment happy-dom
import { act, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import { reloadAppSafely } from '../simulation/worldSource'
import { lazyWithRetry, loadOrReportStale, pendingPrefetchCount, prefetchLazyChunks } from './lazyWithRetry'
import { staleBuildCount } from './staleBuild'
import { UpdateToast } from '../ui/toasts/UpdateToast'

vi.mock('../simulation/worldSource', () => ({ reloadAppSafely: vi.fn() }))
vi.mock('./hooks/useVersionCheck', () => ({ useVersionCheck: () => ({ newVersionAvailable: false }) }))

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  window.requestIdleCallback = ((run: IdleRequestCallback) => {
    queueMicrotask(() => run({ didTimeout: false, timeRemaining: () => 50 }))
    return 1
  }) as typeof window.requestIdleCallback
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.mocked(reloadAppSafely).mockReset()
})

const missing = () =>
  Promise.reject(new Error('Failed to fetch dynamically imported module: /assets/Tree-old.js'))

async function flush() {
  for (let i = 0; i < 10; i++) await act(async () => await Promise.resolve())
}

it('falls back instead of reloading when a chunk from an older build is gone', async () => {
  const marker = () => null
  await expect(loadOrReportStale(missing, marker)).resolves.toEqual({ default: marker })
  const other = new Error('module initialization failed')
  await expect(loadOrReportStale(() => Promise.reject(other), marker)).rejects.toBe(other)
  expect(reloadAppSafely).not.toHaveBeenCalled()
})

it('shows the update notice and keeps the page when a lazy modal chunk is missing', async () => {
  const Tree = lazyWithRetry<() => null>(missing, { prefetch: false })
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const before = staleBuildCount()
  await act(async () => {
    root.render(
      <>
        <UpdateToast />
        <Suspense fallback={null}>
          <Tree />
        </Suspense>
      </>,
    )
  })
  await flush()
  expect(staleBuildCount()).toBe(before + 1)
  expect(reloadAppSafely).not.toHaveBeenCalled()
  expect(host.querySelector('.update-toast__title')?.textContent).toBe('A new version is ready')
  expect(host.querySelector('.update-toast__sub')?.textContent).toContain('Reload to open this')
  act(() => (host.querySelector('.update-toast__close') as HTMLButtonElement).click())
  expect(host.querySelector('.update-toast')).toBeNull()
  act(() => root.unmount())
})

it('fetches every lazy chunk once the world is up, one at a time', async () => {
  const loads: string[] = []
  const factory = (name: string) => () => {
    loads.push(name)
    return Promise.resolve({ default: () => null })
  }
  lazyWithRetry(factory('stats'))
  lazyWithRetry(factory('tree'))
  lazyWithRetry(() => {
    loads.push('gone')
    return missing()
  })
  lazyWithRetry(factory('never'), { prefetch: false })
  expect(loads).toEqual([])
  prefetchLazyChunks()
  await flush()
  expect(loads).toEqual(['stats', 'tree', 'gone'])
  expect(pendingPrefetchCount()).toBe(0)
  lazyWithRetry(factory('late'))
  await flush()
  expect(loads).toEqual(['stats', 'tree', 'gone', 'late'])
})
