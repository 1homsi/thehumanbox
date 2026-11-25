// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GITHUB_STARS_CACHE_KEY, GITHUB_STARS_CACHE_MS, useGithubStars } from './useGithubStars'

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())

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

function HookProbe({ onStars }: { onStars: (stars: number | null) => void }) {
  const stars = useGithubStars()
  onStars(stars)
  return null
}

const roots: Array<{ unmount: () => void }> = []

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', { value: memoryStorage(), configurable: true })
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ stargazers_count: 145 }),
    }),
  )
})

afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()))
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('useGithubStars', () => {
  it('returns a cached count without fetching when the cache is fresh', () => {
    window.localStorage.setItem(
      GITHUB_STARS_CACHE_KEY,
      JSON.stringify({ count: 150, at: Date.now() - 1_000 }),
    )
    const seen: Array<number | null> = []
    const host = document.createElement('div')
    const root = createRoot(host)
    roots.push(root)
    act(() => root.render(<HookProbe onStars={(stars) => seen.push(stars)} />))
    expect(seen[0]).toBe(150)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('fetches and stores the live count when the cache is missing or stale', async () => {
    window.localStorage.setItem(
      GITHUB_STARS_CACHE_KEY,
      JSON.stringify({ count: 100, at: Date.now() - GITHUB_STARS_CACHE_MS - 1 }),
    )
    const seen: Array<number | null> = []
    const host = document.createElement('div')
    const root = createRoot(host)
    roots.push(root)
    act(() => root.render(<HookProbe onStars={(stars) => seen.push(stars)} />))
    await act(async () => {
      await Promise.resolve()
    })
    expect(fetch).toHaveBeenCalled()
    expect(seen.at(-1)).toBe(145)
    const cached = JSON.parse(window.localStorage.getItem(GITHUB_STARS_CACHE_KEY) ?? '{}') as {
      count: number
    }
    expect(cached.count).toBe(145)
  })

  it('leaves the count empty when GitHub is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const seen: Array<number | null> = []
    const host = document.createElement('div')
    const root = createRoot(host)
    roots.push(root)
    act(() => root.render(<HookProbe onStars={(stars) => seen.push(stars)} />))
    await act(async () => {
      await Promise.resolve()
    })
    expect(seen.at(-1)).toBeNull()
  })
})
