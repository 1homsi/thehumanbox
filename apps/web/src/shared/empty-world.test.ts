import { afterEach, describe, expect, it, vi } from 'vitest'
import { DOCK_TAB_STORAGE_KEY, openEmptyWorldTabFromUrl } from './empty-world'

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubStorage() {
  const values = new Map<string, string>()
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  })
  return values
}

describe('an empty world opens on the Nature tab', () => {
  it('when the desktop shell loads the page for one', () => {
    const values = stubStorage()
    expect(openEmptyWorldTabFromUrl('?desktop=1&reset=1&empty=1')).toBe(true)
    expect(values.get(DOCK_TAB_STORAGE_KEY)).toBe('nature')
  })

  it('and leaves the remembered tab alone on any other load', () => {
    const values = stubStorage()
    values.set(DOCK_TAB_STORAGE_KEY, 'life')
    expect(openEmptyWorldTabFromUrl('?desktop=1&reset=1')).toBe(false)
    expect(values.get(DOCK_TAB_STORAGE_KEY)).toBe('life')
  })

  it('without failing when storage is unavailable', () => {
    vi.stubGlobal('window', {
      localStorage: {
        setItem: () => {
          throw new Error('storage disabled')
        },
      },
    })
    expect(openEmptyWorldTabFromUrl('?empty=1')).toBe(true)
  })
})
