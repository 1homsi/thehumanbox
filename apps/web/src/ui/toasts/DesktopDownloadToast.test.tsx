// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DesktopDownloadToast, FIRST_DELAY_MIN_MS } from './DesktopDownloadToast'
import { TOAST_RETRY_MS } from './screenBusy'

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())
const roots: Array<{ unmount: () => void }> = []

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(Math, 'random').mockReturnValue(0)
  const data = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    },
  })
})
afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()))
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function mount() {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => root.render(<DesktopDownloadToast />))
}
const own = () => document.querySelector('.desktop-toast:not(.star-toast)')
const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms))

describe('DesktopDownloadToast', () => {
  it('stays out of the first minutes of a visit', () => {
    mount()
    wait(FIRST_DELAY_MIN_MS - 1)
    expect(own()).toBeNull()
    wait(1)
    expect(own()).not.toBeNull()
  })

  it('waits for another toast to go instead of stacking on it', () => {
    const star = document.createElement('div')
    star.className = 'desktop-toast star-toast'
    document.body.append(star)
    mount()
    wait(FIRST_DELAY_MIN_MS + TOAST_RETRY_MS * 3)
    expect(own()).toBeNull()
    star.remove()
    wait(TOAST_RETRY_MS)
    expect(own()).not.toBeNull()
  })
})
