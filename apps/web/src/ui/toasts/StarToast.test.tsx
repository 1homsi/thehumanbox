// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { REPO_URL } from '../../shared/links'
import { useUIStore } from '../../state/store'
import { TOAST_RETRY_MS } from './screenBusy'
import { STAR_DELAY_MIN_MS, STAR_PROMPT_KEY, StarToast } from './StarToast'

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())
const roots: Array<{ unmount: () => void }> = []
function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, String(value)),
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(Math, 'random').mockReturnValue(0)
  Object.defineProperty(window, 'localStorage', { value: memoryStorage(), configurable: true })
})
afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()))
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  vi.useRealTimers()
  const flags = useUIStore.getState().viewFlags
  if (flags.photoMode) useUIStore.getState().setViewFlag('photoMode', false)
})

function mount() {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => root.render(<StarToast />))
}
const toast = () => document.querySelector('.star-toast')
const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms))

describe('StarToast', () => {
  it('asks once, after the first-visit delay, and links to the repository', () => {
    mount()
    wait(STAR_DELAY_MIN_MS - 1)
    expect(toast()).toBeNull()
    wait(1)
    expect(toast()).not.toBeNull()
    expect(toast()?.querySelector('a')?.getAttribute('href')).toBe(REPO_URL)
    expect(window.localStorage.getItem(STAR_PROMPT_KEY)).toBe('shown')
  })

  it('stays away once it has been shown before', () => {
    window.localStorage.setItem(STAR_PROMPT_KEY, 'dismissed')
    mount()
    wait(STAR_DELAY_MIN_MS * 4)
    expect(toast()).toBeNull()
  })

  it('waits behind the welcome card and photo mode instead of stacking on them', () => {
    const welcome = document.createElement('div')
    welcome.className = 'welcome-modal'
    document.body.append(welcome)
    mount()
    wait(STAR_DELAY_MIN_MS + TOAST_RETRY_MS * 3)
    expect(toast()).toBeNull()
    welcome.remove()
    act(() => useUIStore.getState().setViewFlag('photoMode', true))
    wait(TOAST_RETRY_MS * 2)
    expect(toast()).toBeNull()
    act(() => useUIStore.getState().setViewFlag('photoMode', false))
    wait(TOAST_RETRY_MS)
    expect(toast()).not.toBeNull()
  })

  it('remembers whether the player starred or dismissed it', () => {
    mount()
    wait(STAR_DELAY_MIN_MS)
    act(() => (toast()?.querySelector('.desktop-toast-secondary') as HTMLButtonElement).click())
    expect(toast()).toBeNull()
    expect(window.localStorage.getItem(STAR_PROMPT_KEY)).toBe('dismissed')

    window.localStorage.removeItem(STAR_PROMPT_KEY)
    mount()
    wait(STAR_DELAY_MIN_MS)
    const link = toast()?.querySelector('a') as HTMLAnchorElement
    link.addEventListener('click', (e) => e.preventDefault())
    act(() => link.click())
    expect(toast()).toBeNull()
    expect(window.localStorage.getItem(STAR_PROMPT_KEY)).toBe('starred')
  })
})
