// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { WorldState } from '../../shared/types'
import { PrayerChip } from './PrayerChip'

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())
let root: Root | null = null
afterEach(() => {
  if (root) act(() => root?.unmount())
  root = null
  document.body.replaceChildren()
})

const world = {
  tick: 100,
  prayers: [{ id: 1, lineage_id: 'a', tribe: 'Boge', kind: 'hunger', x: 1, y: 1, created: 90, expires: 400 }],
} as unknown as WorldState

describe('PrayerChip', () => {
  it('an Escape that closes the prayer list does not also disarm the held tool', () => {
    // The app's own Escape handler listens on the window and disarms the tool unless something took the key.
    const disarm = vi.fn()
    const app = (event: KeyboardEvent) => {
      if (!event.defaultPrevented) disarm()
    }
    window.addEventListener('keydown', app)
    try {
      const host = document.createElement('div')
      document.body.append(host)
      root = createRoot(host)
      act(() => root?.render(<PrayerChip world={world} onAnswer={() => {}} />))
      act(() => host.querySelector<HTMLButtonElement>('.prayer-chip')!.click())
      expect(document.querySelector('.prayer-row')).not.toBeNull()

      act(() => {
        document.body.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
        )
      })
      expect(document.querySelector('.prayer-row')).toBeNull()
      expect(disarm).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('keydown', app)
    }
  })

  it('an Escape from a focused prayer row gives focus back to the prayer chip', () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root?.render(<PrayerChip world={world} onAnswer={() => {}} />))
    act(() => host.querySelector<HTMLButtonElement>('.prayer-chip')!.click())
    const row = document.querySelector<HTMLButtonElement>('.prayer-row')!
    act(() => row.focus())
    act(() => {
      row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    })
    expect(document.querySelector('.prayer-row')).toBeNull()
    expect(document.activeElement).toBe(host.querySelector('.prayer-chip'))
  })
})
