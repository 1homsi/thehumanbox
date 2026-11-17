// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { ChroniclesModal } from './ChroniclesModal'
import { chroniclesBadgeCount, chroniclesDefaultTab, chronicleCounts } from './chronicles-tab'
import { onFreshFrameRequest } from '../../simulation/fresh-frame'
import { dayHeading } from '../event-date'
import { t } from '../../i18n'
import { DAY_TICKS, SEASON_TICKS, YEAR_TICKS } from '../../game/model/calendar'
import { useUIStore } from '../../state/store'
import { useCameraFocus } from '../../state/camera-focus'
import type { HeadlineInfo, OrganismState, StoryEntry } from '../../shared/types'

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())

let root: Root | null = null
afterEach(() => {
  if (root) act(() => root?.unmount())
  root = null
  document.body.replaceChildren()
  useUIStore.setState({ nerdStats: false, selectedOrgId: null })
})

const world = {
  lineage_names: { l1: 'Gelup' },
  settlements: [],
  lineage_sizes: [{ id: 'l1', count: 1 }],
  organisms: [{ id: 'o1', name: 'Huwo', alive: true, x: 12, y: 30, lineage_id: 'l1' } as OrganismState],
}

function renderChronicles(stories: StoryEntry[], headlines: HeadlineInfo[], onClose = () => undefined) {
  const host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() =>
    root?.render(<ChroniclesModal stories={stories} headlines={headlines} world={world} onClose={onClose} />),
  )
}

const tab = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((b) =>
    b.textContent?.startsWith(label),
  )!

describe('ChroniclesModal dates', () => {
  it('heads each day once, counting from day 1 like the calendar tag', () => {
    renderChronicles(
      [],
      [
        { tick: 0, text: 'The first fire is lit.' },
        { tick: 10, text: '🤝 Tare and Towep forged an alliance.' },
      ],
    )
    const headings = [...document.querySelectorAll('.chron-date')].map((h) => h.textContent)
    expect(headings).toEqual([dayHeading(0)])
    expect(headings[0]).toContain('1')
  })

  it('dates a later year by the calendar', () => {
    const tick = YEAR_TICKS + SEASON_TICKS + 2 * DAY_TICKS
    renderChronicles([{ tick, org_name: 'Gelup', lineage_id: 'l1', story: 'Gelup built a wall.' }], [])
    expect(document.querySelector('.chron-date')?.textContent).toBe(dayHeading(tick))
    expect(dayHeading(tick)).not.toBe(dayHeading(0))
  })
})

describe('ChroniclesModal tabs', () => {
  it('tells a screen reader which tab is selected', () => {
    renderChronicles([], [])
    const history = tab(t('dialogs.chronicles.tabHistory'))
    const lives = tab(t('dialogs.chronicles.tabLives'))
    const selected = () => [history, lives].map((b) => b.getAttribute('aria-selected'))
    expect(selected()).toEqual(['true', 'false'])
    act(() => lives.click())
    expect(selected()).toEqual(['false', 'true'])
  })

  it('keeps people in Lives and sums them up under the day in World history', () => {
    renderChronicles(
      [],
      [
        { tick: 5, text: 'Moki became an elder, carrying: "a song"' },
        { tick: 6, text: 'Kehuf became an elder among the people' },
        { tick: 7, text: '👑 Huwo of the Gelup seized power in a coup.' },
        { tick: 8, text: 'the moon stood full and bright' },
      ],
    )
    const body = document.body.textContent ?? ''
    expect(body).toContain('Huwo of the Gelup seized power in a coup.')
    expect(body).not.toContain('Moki became an elder')
    expect(body).not.toContain('the moon stood full')
    const people = document.querySelector<HTMLButtonElement>('.chron-people')!
    expect(people.textContent).toContain(t('dialogs.chronicles.people.elder', { count: '2' }))
    act(() => people.click())
    expect(tab(t('dialogs.chronicles.tabLives')).getAttribute('aria-selected')).toBe('true')
    expect(document.body.textContent).toContain('Moki became an elder')
  })

  it('filters world history by kind', () => {
    renderChronicles(
      [],
      [
        { tick: 1, text: '🤝 Tare and Towep forged an alliance.' },
        { tick: 2, text: '🏛️ The Gelup completed a temple — a wonder of their age.' },
      ],
    )
    const chip = [...document.querySelectorAll<HTMLButtonElement>('.chron-chip')].find(
      (b) => b.textContent === t('dialogs.chronicles.filters.wonders'),
    )!
    act(() => chip.click())
    expect(chip.getAttribute('aria-pressed')).toBe('true')
    expect(document.body.textContent).toContain('a wonder of their age')
    expect(document.body.textContent).not.toContain('forged an alliance')
  })

  it('shows raw ticks only with stats for nerds on', () => {
    renderChronicles([], [{ tick: 4321, text: 'first_fire: the first flame is tamed' }])
    expect(document.querySelector('.chron-tick')).toBeNull()
    expect(document.body.textContent).toContain('The first flame is tamed')
    act(() => useUIStore.setState({ nerdStats: true }))
    expect(document.querySelector('.chron-tick')?.textContent).toContain('first_fire')
  })

  it('flies to the person a row is about and closes', () => {
    const onClose = vi.fn()
    renderChronicles([], [{ tick: 7, text: '👑 Huwo of the Gelup seized power in a coup.' }], onClose)
    const row = document.querySelector<HTMLButtonElement>('button.chron-row')!
    act(() => row.click())
    expect(useUIStore.getState().selectedOrgId).toBe('o1')
    expect(useCameraFocus.getState().request).toMatchObject({ x: 12, y: 30 })
    expect(onClose).toHaveBeenCalledOnce()
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
    const stories = [{ tick: 5, org_name: 'Gelup', lineage_id: 'l1', story: 'Gelup lived well.' }]
    const headlines = [{ tick: 6, text: 'Pakug is gone. What they carried: "a song"' }]
    renderChronicles(stories, headlines)
    expect(document.body.textContent).toContain(t('dialogs.chronicles.livesIntro'))
    const counts = chronicleCounts(stories, headlines)
    expect(counts).toEqual({ lives: 2, history: 0 })
    expect(chroniclesBadgeCount(counts.lives, counts.history)).toBe(2)
  })

  it('opens on history when it has entries, and counts those', () => {
    renderChronicles(
      [{ tick: 5, org_name: 'Gelup', lineage_id: 'l1', story: 'Gelup lived well.' }],
      [{ tick: 0, text: 'The first fire is lit.' }],
    )
    expect(document.body.textContent).toContain('The first fire is lit.')
    expect(chroniclesBadgeCount(1, 1)).toBe(1)
    expect(chroniclesDefaultTab(0, 0)).toBe('history')
  })
})
