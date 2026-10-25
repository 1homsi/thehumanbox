// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { ChroniclesModal } from './ChroniclesModal'
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

/** Opens the Lives tab of the modal. */
function openLivesTab() {
  const tab = [...document.querySelectorAll('button')].find(
    (b) => b.textContent === t('dialogs.chronicles.tabLives'),
  )
  expect(tab).toBeDefined()
  act(() => tab!.click())
}
