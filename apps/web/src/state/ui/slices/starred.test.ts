// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const KEY = 'thb-starred-orgs'

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

/** Load a fresh copy of the UI store, as the app does at start, with the given saved stars. */
async function freshStore(saved: unknown) {
  vi.resetModules()
  window.localStorage.clear()
  if (saved !== undefined) window.localStorage.setItem(KEY, JSON.stringify(saved))
  const { useUIStore } = await import('../index')
  return useUIStore
}

const stored = () => JSON.parse(window.localStorage.getItem(KEY) ?? 'null')

afterEach(() => window.localStorage.clear())

describe('starred people are kept per world', () => {
  it('forgets the stars of an earlier world when a different world starts', async () => {
    const store = await freshStore({ world: 'A', ids: ['ada'] })
    store.getState().bindStarredWorld('B')
    expect(store.getState().starredOrgIds).toEqual([])
    expect(stored()).toEqual({ world: 'B', ids: [] })
  })

  it('keeps the stars when the same world starts again, as after a reload', async () => {
    const store = await freshStore({ world: 'A', ids: ['ada'] })
    store.getState().bindStarredWorld('A')
    expect(store.getState().starredOrgIds).toEqual(['ada'])
  })

  it('saves a new star with the world it was made in', async () => {
    const store = await freshStore({ world: 'A', ids: [] })
    store.getState().bindStarredWorld('A')
    store.getState().toggleStar('bo')
    expect(stored()).toEqual({ world: 'A', ids: ['bo'] })
  })

  it('adopts the stars saved before worlds were recorded', async () => {
    const store = await freshStore(['ada'])
    store.getState().bindStarredWorld('A')
    expect(store.getState().starredOrgIds).toEqual(['ada'])
    expect(stored()).toEqual({ world: 'A', ids: ['ada'] })
  })
})
