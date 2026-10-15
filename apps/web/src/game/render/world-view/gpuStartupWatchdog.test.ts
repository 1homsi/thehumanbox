import { afterEach, describe, expect, it, vi } from 'vitest'
import { watchForGpuStartupFailure } from './gpuStartupWatchdog'

function visibilitySource(initiallyHidden = false) {
  const target = new EventTarget()
  let hidden = initiallyHidden
  return {
    source: {
      get hidden() {
        return hidden
      },
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
    } as unknown as Document,
    setHidden(value: boolean) {
      hidden = value
      target.dispatchEvent(new Event('visibilitychange'))
    },
  }
}

describe('GPU startup watchdog', () => {
  afterEach(() => vi.useRealTimers())

  it('does not count hidden-tab time and starts a fresh timeout when visible', () => {
    vi.useFakeTimers()
    const visibility = visibilitySource(true)
    const onFailure = vi.fn()
    const watchdog = watchForGpuStartupFailure(visibility.source, false, onFailure)

    vi.advanceTimersByTime(20_000)
    expect(onFailure).not.toHaveBeenCalled()

    visibility.setHidden(false)
    vi.advanceTimersByTime(9_999)
    expect(onFailure).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onFailure).toHaveBeenCalledOnce()
    watchdog.dispose()
  })

  it('does not count a paused desktop window until it resumes', () => {
    vi.useFakeTimers()
    const visibility = visibilitySource()
    const onFailure = vi.fn()
    const watchdog = watchForGpuStartupFailure(visibility.source, true, onFailure)

    vi.advanceTimersByTime(20_000)
    expect(onFailure).not.toHaveBeenCalled()

    watchdog.setPaused(false)
    vi.advanceTimersByTime(10_000)
    expect(onFailure).toHaveBeenCalledOnce()
    watchdog.dispose()
  })

  it('cancels the active timeout when a tab becomes hidden', () => {
    vi.useFakeTimers()
    const visibility = visibilitySource()
    const onFailure = vi.fn()
    const watchdog = watchForGpuStartupFailure(visibility.source, false, onFailure)

    vi.advanceTimersByTime(9_000)
    visibility.setHidden(true)
    vi.advanceTimersByTime(20_000)
    expect(onFailure).not.toHaveBeenCalled()

    visibility.setHidden(false)
    vi.advanceTimersByTime(10_000)
    expect(onFailure).toHaveBeenCalledOnce()
    watchdog.dispose()
  })

  it('removes the visibility listener and cancels the timeout when disposed', () => {
    vi.useFakeTimers()
    const visibility = visibilitySource()
    const onFailure = vi.fn()
    const watchdog = watchForGpuStartupFailure(visibility.source, false, onFailure)

    vi.advanceTimersByTime(9_000)
    watchdog.dispose()
    visibility.setHidden(true)
    visibility.setHidden(false)
    vi.advanceTimersByTime(20_000)

    expect(onFailure).not.toHaveBeenCalled()
  })
})
