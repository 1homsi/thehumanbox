// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { WorldState } from '../../shared/types'
import { DAY_TICKS, SEASON_TICKS, YEAR_TICKS } from '../../game/model/calendar'
import { CalendarTag } from './CalendarTag'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  document.querySelectorAll('.ui-tooltip').forEach((el) => el.remove())
})

const SEASON_KEYS = ['abundance', 'decline', 'scarcity', 'recovery'] as const
const SEASON_NAMES = ['SUMMER', 'AUTUMN', 'WINTER', 'SPRING'] as const

function worldFor(seasonIndex: number, dayProgress: number, extra: Partial<WorldState> = {}): WorldState {
  const tick = seasonIndex * SEASON_TICKS + Math.round(dayProgress * DAY_TICKS) + YEAR_TICKS * 14
  return {
    tick,
    season: SEASON_KEYS[seasonIndex],
    season_progress: 0.5,
    is_day: dayProgress < 0.7,
    day_progress: dayProgress,
    ...extra,
  } as WorldState
}

function renderTag(world: WorldState) {
  act(() => root.render(<CalendarTag world={world} />))
  const tag = container.querySelector('.time-tag') as HTMLElement | null
  if (!tag) throw new Error('no time tag rendered')
  return tag
}

const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()

describe('CalendarTag: one tag for year, season and time of day', () => {
  const TIMES = [
    { phase: 'dawn', dp: 0.1, icon: 'sunrise' },
    { phase: 'day', dp: 0.5, icon: 'sun' },
    { phase: 'dusk', dp: 0.65, icon: 'sunset' },
    { phase: 'night', dp: 0.8, icon: 'moon' },
  ] as const

  for (let s = 0; s < 4; s++) {
    for (const time of TIMES) {
      it(`${SEASON_NAMES[s]} at ${time.phase} reads year, season and time in one chip`, () => {
        const tag = renderTag(worldFor(s, time.dp))
        expect(text(tag.querySelector('.time-tag-year'))).toBe('Y15')
        expect(text(tag.querySelector('.time-tag-season'))).toBe(SEASON_NAMES[s].toLowerCase())
        expect(text(tag.querySelector('.time-tag-phase'))).toBe(time.phase)
        expect(tag.classList.contains(`season-${SEASON_KEYS[s]}`)).toBe(true)
        expect(tag.classList.contains(`phase-${time.phase}`)).toBe(true)
        expect(tag.classList.contains('hard-winter')).toBe(false)
        // The separators are spaced by the chip's gap, so the text has none of its own.
        expect(text(tag)).toBe(`Y15·${SEASON_NAMES[s].toLowerCase()}·${time.phase}`)
      })
    }
  }

  it('shows the season colour as a dot inside the tag, not a second chip', () => {
    const tag = renderTag(worldFor(0, 0.5))
    expect(tag.querySelector('.time-tag-season .time-tag-dot')).not.toBeNull()
    expect(container.querySelectorAll('.hdr-chip').length).toBe(1)
    expect(container.querySelector('.season-badge, .daynight, .calendar-chip')).toBeNull()
  })

  it('marks the day sprite for each time of day', () => {
    for (const time of TIMES) {
      const tag = renderTag(worldFor(0, time.dp))
      const svg = tag.querySelector('.time-tag-phase svg')
      expect(svg).not.toBeNull()
    }
  })

  it('names a hard winter and keeps the warning for one ahead', () => {
    const hard = renderTag(worldFor(2, 0.5, { hard_winter: true }))
    expect(hard.classList.contains('hard-winter')).toBe(true)
    expect(text(hard.querySelector('.time-tag-season'))).toBe('hard winter')

    const ahead = renderTag(worldFor(1, 0.5, { hard_winter_ahead: true }))
    expect(ahead.classList.contains('hard-winter')).toBe(false)
    expect(text(ahead.querySelector('.time-tag-season'))).toBe('autumn❄')
    expect(ahead.querySelector('.time-tag-omen')?.getAttribute('aria-label')).toBe('hard winter ahead')
  })

  it('keeps the moon phase in the tooltip, since its chip is hidden on narrower screens', () => {
    const tag = renderTag(
      worldFor(0, 0.5, {
        cosmos: { moon_phase: 'waxing_gibbous', year: 14, day_of_year: 4 },
      } as Partial<WorldState>),
    )
    act(() => tag.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })))
    const body = text(document.querySelector('.ui-tooltip'))
    expect(body).toContain('moon: waxing gibbous')
    expect(body).toContain('Year 15, day 5.')
  })

  it('explains the full date, the season and the time in its tooltip', () => {
    const tag = renderTag(worldFor(0, 0.8))
    act(() => tag.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })))
    const tip = document.querySelector('.ui-tooltip') as HTMLElement | null
    expect(tip).not.toBeNull()
    const body = text(tip)
    expect(body).toContain('Year 15, Summer')
    expect(body).toContain('Day 1 of 5 in summer')
    expect(body).toContain('Food is plentiful.')
    expect(body).toContain('Nighttime, 80% through the day.')
  })
})
