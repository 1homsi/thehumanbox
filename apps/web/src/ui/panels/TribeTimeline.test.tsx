// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { TribeTimeline } from './TribeTimeline'
import { useCameraFocus } from '../../state/camera-focus'
import { t } from '../../i18n'
import type { WorldState } from '../../shared/types'
import type { SeriesSample } from '../../game/model/tribe-series'

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())
const roots: Root[] = []
afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()))
  document.body.innerHTML = ''
  useCameraFocus.setState({ request: null })
})

const samples: SeriesSample[] = [
  { tick: 0, people: 10, food: 0.8, health: 0.9 },
  { tick: 300, people: 12, food: 0.6, health: 0.8 },
  { tick: 600, people: 7, food: 0.2, health: 0.5 },
]

function render(world: WorldState, list: readonly SeriesSample[]): HTMLElement {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => root.render(<TribeTimeline world={world} lineage="a" samples={list} />))
  return host
}

describe('TribeTimeline', () => {
  it('says so while a tribe has too little history to chart', () => {
    const host = render(
      { tick: 1, organisms: [], tribe_chronicle: {} } as unknown as WorldState,
      samples.slice(0, 1),
    )
    expect(host.textContent).toContain(t('panels.tribe.timeline.notEnough'))
    expect(host.querySelector('svg')).toBeNull()
  })

  it('draws a people, food and health chart, and puts major events on the same time axis', () => {
    const host = render(
      {
        tick: 600,
        organisms: [],
        tribe_chronicle: {
          a: [
            { tick: 300, kind: 'war', other: 'b', word: null, x: 4, y: 5 },
            { tick: 450, kind: 'craft', other: null, word: 'fishing', x: 1, y: 1 },
            { tick: 600, kind: 'famine', other: null, word: null, x: null, y: null },
          ],
        },
      } as unknown as WorldState,
      samples,
    )
    expect(host.querySelectorAll('svg polyline')).toHaveLength(3)
    // The craft is left to the history list; the war has a place, the famine has none.
    expect(host.querySelectorAll('.tribe-timeline-marker')).toHaveLength(2)
    expect(host.querySelectorAll('button.tribe-timeline-marker')).toHaveLength(1)
    const war = host.querySelector('button.tribe-timeline-marker') as HTMLElement
    expect(war.style.left).toBe('50%')
    expect(host.querySelector('.tribe-timeline-value')?.textContent).toBe('7')
  })

  it('a click on an event with a place takes the camera there', () => {
    const host = render(
      {
        tick: 600,
        organisms: [],
        tribe_chronicle: { a: [{ tick: 300, kind: 'raid', other: null, word: null, x: 4, y: 5 }] },
      } as unknown as WorldState,
      samples,
    )
    act(() => (host.querySelector('button.tribe-timeline-marker') as HTMLButtonElement).click())
    expect(useCameraFocus.getState().request).toMatchObject({ x: 4, y: 5 })
  })

  it('shows an event that came after the last sample, stretching the axis to it', () => {
    const host = render(
      {
        tick: 800,
        organisms: [],
        tribe_chronicle: { a: [{ tick: 800, kind: 'war', other: 'b', word: null, x: 4, y: 5 }] },
      } as unknown as WorldState,
      samples,
    )
    const war = host.querySelector('button.tribe-timeline-marker') as HTMLElement
    expect(war).not.toBeNull()
    expect(war.style.left).toBe('100%')
  })

  it('an event with no place can still be reached by keyboard and read', () => {
    const host = render(
      {
        tick: 600,
        organisms: [],
        tribe_chronicle: { a: [{ tick: 600, kind: 'famine', other: null, word: null, x: null, y: null }] },
      } as unknown as WorldState,
      samples,
    )
    const plain = host.querySelector('.tribe-timeline-marker.plain') as HTMLElement
    expect(plain.tabIndex).toBe(0)
    expect(plain.getAttribute('role')).toBe('img')
    expect(plain.getAttribute('aria-label')).toBe(plain.title)
  })
})
