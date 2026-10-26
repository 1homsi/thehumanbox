// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { WordSplitToast, WORD_SPLIT_KEY } from './WordSplitToast'
import { SPLIT_CONFIRM_TICKS } from '../../game/model/word-split'
import { TOAST_RETRY_MS } from './screenBusy'
import type { WorldState } from '../../shared/types'

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())

const roots: Root[] = []
let host: HTMLElement
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
  window.localStorage.setItem('thb-wasm-seed', '777')
  host = document.createElement('div')
  document.body.append(host)
})
afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()))
  host.remove()
  document.body.innerHTML = ''
})

function frame(tick: number, water: string): WorldState {
  return {
    tick,
    lineage_words: { La: { water: 'pi' }, Lb: { water: water } },
    lineage_names: { La: 'Ula', Lb: 'Mo' },
  } as unknown as WorldState
}

function mount(root: Root, world: WorldState) {
  act(() => root.render(<WordSplitToast world={world} />))
}

describe('WordSplitToast', () => {
  it('tells the player once, when two tribes that shared a word for water split', () => {
    const root = createRoot(host)
    roots.push(root)
    mount(root, frame(1000, 'pi'))
    mount(root, frame(1500, 'ka'))
    expect(host.textContent).toBe('')
    mount(root, frame(1500 + SPLIT_CONFIRM_TICKS, 'ka'))
    expect(host.textContent).toContain('Words have split')
    expect(host.textContent).toContain('Ula and Mo used to share a word for water')
    expect(host.textContent).toContain('ka')
    expect(window.localStorage.getItem(WORD_SPLIT_KEY)).toBe('["777"]')
  })

  it('drops a split still waiting for an empty screen when the world starts over', () => {
    vi.useFakeTimers()
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    try {
      const root = createRoot(host)
      roots.push(root)
      mount(root, frame(1000, 'pi'))
      mount(root, frame(1500, 'ka'))
      mount(root, frame(1500 + SPLIT_CONFIRM_TICKS, 'ka'))
      // The split is found but the screen is busy, so the notice waits. Then the world starts over.
      expect(host.textContent).toBe('')
      mount(root, frame(200, 'pi'))
      hidden.mockReturnValue(false)
      act(() => {
        vi.advanceTimersByTime(TOAST_RETRY_MS * 5)
      })
      expect(host.textContent).toBe('')
      expect(window.localStorage.getItem(WORD_SPLIT_KEY)).toBe(null)
    } finally {
      hidden.mockRestore()
      vi.useRealTimers()
    }
  })

  it('drops a waiting split, and the watch, when another seed replaces the world at a later tick', () => {
    vi.useFakeTimers()
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    try {
      const root = createRoot(host)
      roots.push(root)
      mount(root, frame(1000, 'pi'))
      mount(root, frame(1500, 'ka'))
      mount(root, frame(1500 + SPLIT_CONFIRM_TICKS, 'ka'))
      expect(host.textContent).toBe('')
      // A recovery swaps in a different world further along; its tribes still share the word.
      window.localStorage.setItem('thb-wasm-seed', '888')
      mount(root, frame(5000, 'ka'))
      hidden.mockReturnValue(false)
      act(() => {
        vi.advanceTimersByTime(TOAST_RETRY_MS * 5)
      })
      expect(host.textContent).toBe('')
      expect(window.localStorage.getItem(WORD_SPLIT_KEY)).toBe(null)
    } finally {
      hidden.mockRestore()
      vi.useRealTimers()
    }
  })

  it('stays quiet in a world that already showed the notice (a bare seed from before the list counts)', () => {
    window.localStorage.setItem(WORD_SPLIT_KEY, '777')
    const root = createRoot(host)
    roots.push(root)
    mount(root, frame(1000, 'pi'))
    mount(root, frame(1500, 'ka'))
    mount(root, frame(1500 + SPLIT_CONFIRM_TICKS, 'ka'))
    expect(host.textContent).toBe('')
  })

  it('remembers every world shown the notice, not just the last', () => {
    window.localStorage.setItem(WORD_SPLIT_KEY, JSON.stringify(['777', '888']))
    const root = createRoot(host)
    roots.push(root)
    mount(root, frame(1000, 'pi'))
    mount(root, frame(1500, 'ka'))
    mount(root, frame(1500 + SPLIT_CONFIRM_TICKS, 'ka'))
    expect(host.textContent).toBe('')
    expect(window.localStorage.getItem(WORD_SPLIT_KEY)).toBe('["777","888"]')
  })
})
