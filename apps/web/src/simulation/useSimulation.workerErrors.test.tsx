// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { captureException, trackEvent } = vi.hoisted(() => ({
  captureException: vi.fn(),
  trackEvent: vi.fn(),
}))
vi.mock('../shared/observability', () => ({ captureException, trackEvent }))

class MockWorker {
  static last: MockWorker | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onerror: ((event: { message: string }) => void) | null = null
  postMessage = vi.fn()
  terminate = vi.fn()
  constructor() {
    MockWorker.last = this
  }
}

const { useSimulation } = await import('./useSimulation')
const { loadLocale } = await import('../i18n')

type Sim = ReturnType<typeof useSimulation>
let root: Root | null = null
let sim: Sim | null = null

function Harness() {
  sim = useSimulation('wasm')
  return null
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('Worker', MockWorker)
  captureException.mockClear()
  trackEvent.mockClear()
  root = createRoot(document.createElement('div'))
  act(() => root?.render(createElement(Harness)))
})

afterEach(async () => {
  act(() => root?.unmount())
  root = null
  vi.unstubAllGlobals()
  await loadLocale('en')
})

function fromWorker(data: unknown) {
  act(() => MockWorker.last?.onmessage?.({ data }))
}

describe('useSimulation worker errors', () => {
  it('reports a failed start once, to error tracking and as world_startup_failed', () => {
    fromWorker({
      type: 'error',
      fatal: true,
      code: 'engine_failed',
      phase: 'engine',
      detail: 'out of memory',
      message: 'wasm init failed: out of memory',
    })
    fromWorker({ type: 'error', fatal: true, code: 'engine_failed', message: 'again' })
    expect(captureException).toHaveBeenCalledOnce()
    expect(captureException.mock.calls[0][1]).toMatchObject({
      source: 'wasm_worker',
      code: 'engine_failed',
      phase: 'engine',
    })
    expect(trackEvent).toHaveBeenCalledWith('world_startup_failed', {
      code: 'engine_failed',
      phase: 'engine',
      message: 'wasm init failed: out of memory',
    })
    expect(sim?.localSaveStatus).toMatchObject({ phase: 'error', fatal: true })
  })

  it('reports a crash after the world is ready without calling it a failed start', () => {
    fromWorker({ type: 'ready', restored: false, tick: 0 })
    fromWorker({ type: 'error', fatal: true, code: 'sim_crashed', message: 'the simulation crashed: boom' })
    expect(captureException).toHaveBeenCalledOnce()
    expect(trackEvent).not.toHaveBeenCalledWith('world_startup_failed', expect.anything())
  })

  it('reports a worker that dies outright', () => {
    act(() => MockWorker.last?.onerror?.({ message: 'script error' }))
    expect(captureException).toHaveBeenCalledOnce()
    expect(captureException.mock.calls[0][1]).toMatchObject({ code: 'worker_stopped' })
  })

  it('shows a save error in the interface language', async () => {
    await loadLocale('de')
    fromWorker({
      type: 'error',
      retryable: true,
      code: 'autosave_failed',
      detail: 'QuotaExceededError',
      message: 'autosave failed: QuotaExceededError',
    })
    expect(sim?.localSaveStatus).toMatchObject({
      phase: 'error',
      message: 'Automatisches Speichern fehlgeschlagen: QuotaExceededError',
    })
    expect(captureException).not.toHaveBeenCalled()
  })
})
