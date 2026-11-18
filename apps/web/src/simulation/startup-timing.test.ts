import { afterEach, describe, expect, it, vi } from 'vitest'

const trackEvent = vi.fn()
vi.mock('../shared/observability', () => ({ trackEvent: (...args: unknown[]) => trackEvent(...args) }))

const { readStartup, reportWorldStartup, resetStartupReport, useSimEngine } = await import('./startup-timing')

const startup = {
  engine: 'single',
  threads: 1,
  fallback: 'slow',
  engine_ms: 3400,
  lock_ms: 2,
  restore_ms: 15,
  generate_ms: 820,
  total_ms: 4237,
}

afterEach(() => {
  trackEvent.mockClear()
  resetStartupReport()
  useSimEngine.setState({ engine: null })
})

describe('the worker startup report', () => {
  it('reads a well-formed report', () => {
    expect(readStartup(startup)).toEqual(startup)
    expect(readStartup({ ...startup, engine: 'threads', threads: 4, fallback: null })?.engine).toBe('threads')
    expect(readStartup({ ...startup, fallback: 'webkit' })?.fallback).toBe('webkit')
  })

  it('ignores a missing or malformed one, as an older worker would send', () => {
    expect(readStartup(undefined)).toBeNull()
    expect(readStartup({ ...startup, engine: 'gpu' })).toBeNull()
    expect(readStartup({ ...startup, fallback: 'tired' })).toBeNull()
    expect(readStartup({ ...startup, generate_ms: Number.NaN })).toBeNull()
    expect(readStartup({ ...startup, total_ms: undefined })).toBeNull()
  })

  it('reports the phases, the page time and the core count once per page', () => {
    reportWorldStartup(readStartup(startup)!, 5123.6, 12)
    reportWorldStartup(readStartup(startup)!, 9000, 12)
    expect(trackEvent).toHaveBeenCalledOnce()
    expect(trackEvent).toHaveBeenCalledWith('world_startup', { ...startup, page_ms: 5124, cores: 12 })
  })

  it('sends a null core count when the browser does not tell', () => {
    reportWorldStartup(readStartup(startup)!, 100, null)
    expect(trackEvent).toHaveBeenCalledWith('world_startup', { ...startup, page_ms: 100, cores: null })
  })

  it('keeps the engine of every start for Stats for nerds', () => {
    reportWorldStartup(readStartup(startup)!, 100, 8)
    expect(useSimEngine.getState().engine).toEqual({ engine: 'single', threads: 1, fallback: 'slow' })
    reportWorldStartup(readStartup({ ...startup, engine: 'threads', threads: 4, fallback: null })!, 200, 8)
    expect(useSimEngine.getState().engine).toEqual({ engine: 'threads', threads: 4, fallback: null })
  })
})
