// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { ChroniclesModal } from './ChroniclesModal'
import { chroniclesBadgeCount, chroniclesDefaultTab } from './chronicles-tab'
import { onFreshFrameRequest } from '../../simulation/fresh-frame'
import { eventDate } from '../event-date'
import { t } from '../../i18n'
import { DAY_TICKS, SEASON_TICKS, YEAR_TICKS } from '../../game/model/calendar'
import type { StoryEntry } from '../../shared/types'

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())

let root: Root | null = null
afterEach(() => {
  if (root) act(() => root?.unmount())
  root = null
  document.body.replaceChildren()
})

function renderChronicles(stories: StoryEntry[], headlines: { tick: number; text: string }[]) {
  const host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() =>
    root?.render(<ChroniclesModal stories={stories} headlines={headlines} onClose={() => undefined} />),
  )
}

describe('ChroniclesModal day labels', () => {
  it('dates the first history entry the way the calendar tag does, counting from day 1', () => {
    renderChronicles([], [{ tick: 0, text: 'The first fire is lit.' }])

    // The tag shows year 1, the first day of the first season at tick 0.
    expect(document.querySelector('.chronicle-day')?.textContent).toBe(eventDate(0))
    expect(document.querySelector('.chronicle-day')?.textContent).not.toContain('day 0')
  })

  it('dates a life story by the calendar, so a later year reads as year 2', () => {
    const tick = YEAR_TICKS + SEASON_TICKS + 2 * DAY_TICKS
    renderChronicles([{ tick, org_name: 'Ada', lineage_id: 'a', story: 'Lived well.' }], [])
    openLivesTab()

    const label = document.querySelector('.chronicle-day')?.textContent ?? ''
    expect(label).toBe(eventDate(tick))
    expect(label).not.toBe(eventDate(0))
  })
})

describe('ChroniclesModal tabs', () => {
  it('tells a screen reader which tab is selected', () => {
    renderChronicles([], [])
    const tab = (label: string) =>
      [...document.querySelectorAll('button')].find((b) => b.textContent === label)!
    const history = tab(t('dialogs.chronicles.tabHistory'))
    const lives = tab(t('dialogs.chronicles.tabLives'))
    expect(history.type).toBe('button')
    expect(lives.type).toBe('button')
    const pressed = () => [history, lives].map((b) => b.getAttribute('aria-pressed'))
    const before = pressed()
    expect(before.filter((p) => p === 'true')).toHaveLength(1)
    act(() => (before[0] === 'true' ? lives : history).click())
    expect(pressed()).toEqual([...before].reverse())
  })
})

describe('ChroniclesModal opening', () => {
  it('asks the local world for a fresh full frame when it opens', () => {
    const request = vi.fn()
    const stop = onFreshFrameRequest(request)
    renderChronicles([], [])
    stop()
    expect(request).toHaveBeenCalledOnce()
  })

  it('opens on lives when only lives have entries, as the header badge counts', () => {
    const stories = [{ tick: 5, org_name: 'Ada', lineage_id: 'a', story: 'Lived well.' }]
    renderChronicles(stories, [])
    expect(document.body.textContent).toContain(t('dialogs.chronicles.livesIntro'))
    expect(document.body.textContent).not.toContain(t('dialogs.chronicles.noHistory'))
    expect(chroniclesBadgeCount(stories.length, 0)).toBe(1)
  })

  it('opens on history when it has entries, and counts those', () => {
    renderChronicles(
      [{ tick: 5, org_name: 'Ada', lineage_id: 'a', story: 'Lived well.' }],
      [{ tick: 0, text: 'The first fire is lit.' }],
    )
    expect(document.body.textContent).toContain('The first fire is lit.')
    expect(chroniclesBadgeCount(1, 1)).toBe(1)
    expect(chroniclesDefaultTab(0, 0)).toBe('history')
  })
})

/** Opens the Lives tab of the modal. */
function openLivesTab() {
  const tab = [...document.querySelectorAll('button')].find(
    (b) => b.textContent === t('dialogs.chronicles.tabLives'),
  )
  expect(tab).toBeDefined()
  act(() => tab!.click())
}
