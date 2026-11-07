// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { OpeningGuide } from './OpeningGuide'
import { largestTribe } from './opening-lines'
import { openingHides, useOpeningGuide } from '../../state/opening-guide'
import { useCameraFocus } from '../../state/camera-focus'
import { t } from '../../i18n'
import type { WorldState } from '../../shared/types'

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())
const roots: Root[] = []
// happy-dom's localStorage is unavailable here, so the opening would read as already seen.
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
  Object.defineProperty(window, 'localStorage', { value: memoryStorage(), configurable: true })
  useOpeningGuide.setState({ beat: null, tribe: null, beatSeconds: 0, acted: false })
  useCameraFocus.setState({ request: null })
})
afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()))
  document.body.innerHTML = ''
  vi.useRealTimers()
})

function person(id: string, lineage: string, x: number, y: number) {
  return { id, lineage_id: lineage, alive: true, x, y, energy: 0.8, hydration: 0.8, health: 1, infection: 0 }
}

const world = {
  tick: 10,
  lineage_names: { a: 'Ash', b: 'Bren' },
  organisms: [person('1', 'a', 1, 1), person('2', 'b', 20, 30), person('3', 'b', 22, 30)],
  settlements: [],
  faith: { by_lineage: {}, blessed: [], despairing: [], answered: 0 },
  prayers: [],
} as unknown as WorldState

function render(w: WorldState): HTMLElement {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => root.render(<OpeningGuide world={w} />))
  return host
}

describe('opening guide', () => {
  it('follows the tribe with the most people', () => {
    expect(largestTribe(world)).toBe('b')
  })

  it('runs once: a finished opening does not start again', () => {
    useOpeningGuide.getState().start()
    expect(useOpeningGuide.getState().beat).toBe('meet')
    useOpeningGuide.getState().finish()
    useOpeningGuide.getState().start()
    expect(useOpeningGuide.getState().beat).toBeNull()
  })

  it('keeps the powers and the header hidden until their beats', () => {
    expect(openingHides('meet', 'powers')).toBe(true)
    expect(openingHides('meet', 'header')).toBe(true)
    expect(openingHides('powers', 'powers')).toBe(false)
    expect(openingHides('powers', 'header')).toBe(true)
    expect(openingHides('history', 'header')).toBe(false)
    expect(openingHides(null, 'powers')).toBe(false)
  })

  it('takes the camera close to the tribe, introduces it, and hides what is still to come', () => {
    useOpeningGuide.getState().start()
    const host = render(world)
    expect(useOpeningGuide.getState().tribe).toBe('b')
    expect(useCameraFocus.getState().request).toMatchObject({ x: 21, y: 30, zoom: 3 })
    expect(host.textContent).toContain(t('dialogs.opening.meet', { tribe: 'Bren' }))
    expect(document.body.dataset.opening).toBe('powers header')
  })

  it('moves through the beats on its own and pulls back to the whole world at the end', () => {
    useOpeningGuide.getState().start()
    render(world)
    for (let i = 0; i < 200 && useOpeningGuide.getState().beat !== 'world'; i++) {
      act(() => vi.advanceTimersByTime(1000))
    }
    expect(useOpeningGuide.getState().beat).toBe('world')
    expect(useCameraFocus.getState().request).toMatchObject({ kind: 'fit' })
    expect(document.body.dataset.opening).toBeUndefined()
  })

  it('moves on from the powers beat soon after the player acts', () => {
    useOpeningGuide.setState({ beat: 'powers', tribe: 'b', beatSeconds: 0, acted: false })
    render(world)
    act(() => useOpeningGuide.getState().noteAction())
    act(() => vi.advanceTimersByTime(6000))
    expect(useOpeningGuide.getState().beat).toBe('history')
  })

  it('can be skipped, which shows everything again for good', () => {
    useOpeningGuide.getState().start()
    const host = render(world)
    act(() => host.querySelector<HTMLButtonElement>('.opening-skip')!.click())
    expect(useOpeningGuide.getState().beat).toBeNull()
    expect(document.body.dataset.opening).toBeUndefined()
    expect(host.querySelector('.opening-caption')).toBeNull()
  })
})
