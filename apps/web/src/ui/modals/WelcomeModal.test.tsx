// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { WelcomeModal } from './WelcomeModal'

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())
const roots: Array<{ unmount: () => void }> = []
// happy-dom's localStorage is unavailable here, so the card would read as already seen.
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
  Object.defineProperty(window, 'localStorage', { value: memoryStorage(), configurable: true })
})
afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()))
  document.body.innerHTML = ''
})

function mount() {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => root.render(<WelcomeModal />))
}

function press(target: Element, key: string, init: KeyboardEventInit = {}) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }))
  })
}

function controls() {
  return document.querySelectorAll<HTMLButtonElement>('.welcome-modal button')
}

describe('WelcomeModal', () => {
  it('keeps Tab inside the card: Tab from the last control wraps to the first', () => {
    mount()
    const last = controls()[controls().length - 1]
    act(() => last.focus())
    press(last, 'Tab')
    expect(document.activeElement).toBe(controls()[0])
  })

  it('keeps Shift+Tab inside the card: Shift+Tab from the first control wraps to the last', () => {
    mount()
    const first = controls()[0]
    act(() => first.focus())
    press(first, 'Tab', { shiftKey: true })
    expect(document.activeElement).toBe(controls()[controls().length - 1])
  })

  it('Tab with focus on the page body pulls focus back into the card', () => {
    mount()
    // A click on the card's text leaves focus on the body, outside the card.
    act(() => (document.activeElement as HTMLElement | null)?.blur())
    press(document.body, 'Tab')
    expect(document.activeElement).toBe(controls()[0])
  })

  it('Escape with focus on the page body still skips the welcome', () => {
    mount()
    act(() => (document.activeElement as HTMLElement | null)?.blur())
    press(document.body, 'Escape')
    expect(document.querySelector('.welcome-modal')).toBeNull()
    expect(window.localStorage.getItem('thb-welcome-seen-v1')).toBe('1')
  })

  it('leaves keys alone while a field outside the card has focus', () => {
    mount()
    const field = document.createElement('input')
    document.body.append(field)
    act(() => field.focus())
    press(field, 'Escape')
    press(field, 'Tab')
    expect(document.querySelector('.welcome-modal')).not.toBeNull()
    expect(document.activeElement).toBe(field)
  })

  it('Escape from the page behind the card still skips it, e.g. after a palette closes', () => {
    mount()
    const map = document.createElement('button')
    document.body.append(map)
    act(() => map.focus())
    press(map, 'Escape')
    expect(document.querySelector('.welcome-modal')).toBeNull()
  })

  it('Escape skips the welcome and does not show it again', () => {
    mount()
    press(document.querySelector('.welcome-modal')!, 'Escape')
    expect(document.querySelector('.welcome-modal')).toBeNull()
    expect(window.localStorage.getItem('thb-welcome-seen-v1')).toBe('1')
  })
})
