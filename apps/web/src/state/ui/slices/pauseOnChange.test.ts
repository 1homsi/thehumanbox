// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const KEY = 'thb-pause-on'
const LEGACY_KEY = 'thb-pause-on-peril'

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

beforeEach(() =>
  Object.defineProperty(window, 'localStorage', { value: memoryStorage(), configurable: true }),
)

/** A fresh copy of the UI store, as the app starts, with the given saved settings. */
async function freshStore(setup: () => void) {
  vi.resetModules()
  window.localStorage.clear()
  setup()
  const { useUIStore } = await import('../index')
  return useUIStore
}

afterEach(() => vi.resetModules())

describe('pause on change', () => {
  it('starts with every change off when nothing was saved', async () => {
    const store = await freshStore(() => {})
    expect(Object.values(store.getState().pauseOn).every((on) => on === false)).toBe(true)
  })

  it('keeps the old on-the-brink switch as the brink change', async () => {
    const store = await freshStore(() => window.localStorage.setItem(LEGACY_KEY, '1'))
    expect(store.getState().pauseOn).toEqual({
      brink: true,
      era: false,
      war: false,
      famine: false,
      extinct: false,
    })
  })

  it('saves each change on its own and restores it on the next start', async () => {
    const store = await freshStore(() => {})
    store.getState().setPauseOn('era', true)
    store.getState().setPauseOn('war', true)
    store.getState().setPauseOn('war', false)
    expect(store.getState().pauseOn.era).toBe(true)
    expect(store.getState().pauseOn.war).toBe(false)
    expect(JSON.parse(window.localStorage.getItem(KEY) ?? 'null')).toMatchObject({ era: true, war: false })

    const saved = window.localStorage.getItem(KEY) ?? '{}'
    const again = await freshStore(() => window.localStorage.setItem(KEY, saved))
    expect(again.getState().pauseOn.era).toBe(true)
    expect(again.getState().pauseOn.war).toBe(false)
  })

  it('ignores a saved value that is not a list of switches', async () => {
    const store = await freshStore(() => window.localStorage.setItem(KEY, 'null'))
    expect(store.getState().pauseOn.brink).toBe(false)
  })
})
