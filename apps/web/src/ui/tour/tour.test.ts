import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const runTour = vi.fn()
vi.mock('./tour-runner', () => ({ runTour }))

function stubWindow(narrow: boolean) {
  const store = new Map<string, string>()
  vi.stubGlobal('window', {
    matchMedia: () => ({ matches: narrow }),
    localStorage: {
      setItem: (k: string, v: string) => void store.set(k, v),
      getItem: (k: string) => store.get(k) ?? null,
    },
  })
  return store
}

describe('lazy tour', () => {
  beforeEach(() => {
    runTour.mockClear()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not start on narrow screens, and marks the tour as seen', async () => {
    const store = stubWindow(true)
    const { startTour, isTourSupported } = await import('./tour')
    expect(isTourSupported()).toBe(false)
    startTour('local')
    await Promise.resolve()
    expect(runTour).not.toHaveBeenCalled()
    expect(store.get('thb-tour-completed-v1')).toBe('1')
  })

  it('loads the runner on demand and hands it the world kind', async () => {
    stubWindow(false)
    const { startTour } = await import('./tour')
    startTour('local')
    await vi.waitFor(() => expect(runTour).toHaveBeenCalledWith('local'))
    expect(runTour).toHaveBeenCalledTimes(1)
  })

  it('preloads the runner without starting it', async () => {
    stubWindow(false)
    const { preloadTour } = await import('./tour')
    preloadTour()
    await Promise.resolve()
    expect(runTour).not.toHaveBeenCalled()
  })
})
