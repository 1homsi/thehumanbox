// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorldState } from '../../shared/types'
import { PrayerHint } from './PrayerHint'

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())
const roots: Array<{ render: (n: React.ReactNode) => void; unmount: () => void }> = []

beforeEach(() => {
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
})

const praying = {
  tick: 100,
  prayers: [{ id: 1, lineage_id: 'a', tribe: 'Boge', kind: 'hunger', x: 1, y: 1, created: 90, expires: 400 }],
  faith: { by_lineage: {}, answered: 0, forsaken: 0 },
} as unknown as WorldState

function mount() {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  roots.push(root)
  const render = () => act(() => root.render(<PrayerHint world={{ ...praying }} onAnswer={() => {}} />))
  render()
  return render
}
const hint = () => document.querySelector('.prayer-hint')

describe('PrayerHint', () => {
  it('waits for the welcome card and the tour before teaching prayers', () => {
    const tour = document.createElement('div')
    tour.className = 'shepherd-element thb-shepherd'
    document.body.append(tour)
    const rerender = mount()
    expect(hint()).toBeNull()
    tour.remove()
    rerender() // the world ticks, the hint looks again
    expect(hint()).not.toBeNull()
  })

  it('stays off an open dialog and comes back when it closes, even with the world paused', () => {
    vi.useFakeTimers()
    try {
      mount()
      expect(hint()).not.toBeNull()
      const dialog = document.createElement('div')
      dialog.className = 'thb-modal'
      document.body.append(dialog)
      act(() => vi.advanceTimersByTime(1_000))
      expect(hint()).toBeNull()
      dialog.remove()
      act(() => vi.advanceTimersByTime(1_000))
      expect(hint()).not.toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('waits for the star prompt in the same corner instead of covering its buttons', () => {
    const star = document.createElement('div')
    star.className = 'desktop-toast'
    document.body.append(star)
    const rerender = mount()
    expect(hint()).toBeNull()
    star.remove()
    rerender()
    expect(hint()).not.toBeNull()
  })

  it('does not count itself as another card', () => {
    const rerender = mount()
    rerender()
    rerender()
    expect(hint()).not.toBeNull()
  })
})
