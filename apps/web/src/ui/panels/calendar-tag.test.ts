import { describe, expect, it } from 'vitest'
import type { WorldState } from '../../shared/types'
import { DAY_TICKS, SEASON_TICKS, YEAR_TICKS } from '../../game/model/calendar'
import { calendarTagParts, dayPhase, seasonNote } from './calendar-tag'

/** A world at a given tick: the season and the day's light, the way the sim frame reports them. */
function worldAt(tick: number, extra: Partial<WorldState> = {}): WorldState {
  const seasonKey = ['abundance', 'decline', 'scarcity', 'recovery'][
    Math.floor((tick % YEAR_TICKS) / SEASON_TICKS)
  ]
  const dayProgress = (tick % DAY_TICKS) / DAY_TICKS
  return {
    tick,
    season: seasonKey,
    season_progress: 0.5,
    is_day: dayProgress < 0.7,
    day_progress: dayProgress,
    ...extra,
  } as WorldState
}

// One year's four seasons, each at dawn, day, dusk and night. Season starts are
// 0, 3000, 6000 and 9000 ticks; within a day, dawn is 0.1, day 0.5, dusk 0.65, night 0.8.
const SEASONS = [
  { key: 'abundance', name: 'Summer', start: 0 },
  { key: 'decline', name: 'Autumn', start: SEASON_TICKS },
  { key: 'scarcity', name: 'Winter', start: 2 * SEASON_TICKS },
  { key: 'recovery', name: 'Spring', start: 3 * SEASON_TICKS },
] as const
const TIMES = [
  { phase: 'dawn', offset: 0.1 * DAY_TICKS },
  { phase: 'day', offset: 0.5 * DAY_TICKS },
  { phase: 'dusk', offset: 0.65 * DAY_TICKS },
  { phase: 'night', offset: 0.8 * DAY_TICKS },
] as const

describe('dayPhase', () => {
  it('is night whenever the sun is down, whatever the progress', () => {
    for (const dp of [0, 0.3, 0.7, 0.99]) expect(dayPhase({ is_day: false, day_progress: dp })).toBe('night')
  })

  it('splits the daylight at the sky thresholds: dawn before 0.12, dusk after 0.55', () => {
    const at = (dp: number) => dayPhase({ is_day: true, day_progress: dp })
    expect(at(0)).toBe('dawn')
    expect(at(0.11)).toBe('dawn')
    expect(at(0.12)).toBe('day')
    expect(at(0.3)).toBe('day')
    expect(at(0.55)).toBe('day')
    expect(at(0.56)).toBe('dusk')
    expect(at(0.69)).toBe('dusk')
  })

  it('reads a missing progress as midday, as the sky does', () => {
    expect(dayPhase({ is_day: true, day_progress: undefined as unknown as number })).toBe('day')
  })
})

describe('calendarTagParts: every season at every time of day', () => {
  for (const season of SEASONS) {
    for (const time of TIMES) {
      it(`${season.name} ${time.phase}`, () => {
        const tick = season.start + time.offset + 2 * DAY_TICKS
        const world = worldAt(tick)
        const parts = calendarTagParts(world)
        expect(parts.year).toBe(1)
        expect(parts.calendarSeason).toBe(season.name)
        expect(parts.seasonWord).toBe(season.name.toLowerCase())
        expect(parts.seasonClass).toBe(season.key)
        expect(parts.phase).toBe(time.phase)
        expect(parts.hardWinter).toBe(false)
        expect(parts.hardWinterAhead).toBe(false)
        expect(parts.dayOfSeason).toBe(3)
      })
    }
  }

  it('counts the year up across years', () => {
    expect(calendarTagParts(worldAt(YEAR_TICKS * 14 + 5 * DAY_TICKS)).year).toBe(15)
  })

  it('shows the snowflake only for a hard winter that is still ahead', () => {
    const ahead = calendarTagParts(worldAt(SEASON_TICKS, { hard_winter_ahead: true }))
    expect(ahead.hardWinterAhead).toBe(true)
    expect(ahead.hardWinter).toBe(false)
    expect(ahead.seasonWord).toBe('autumn')
  })

  it('names a hard winter as it is, and does not also flag it as ahead', () => {
    const hard = calendarTagParts(worldAt(2 * SEASON_TICKS, { hard_winter: true, hard_winter_ahead: true }))
    expect(hard.hardWinter).toBe(true)
    expect(hard.hardWinterAhead).toBe(false)
    expect(hard.seasonWord).toBe('hard winter')
  })

  it('gives the percent through the day for the tooltip', () => {
    expect(calendarTagParts(worldAt(0, { day_progress: 0.8, is_day: false })).dayPercent).toBe(80)
    expect(calendarTagParts(worldAt(0, { day_progress: undefined as unknown as number })).dayPercent).toBe(0)
  })
})

describe('seasonNote', () => {
  it('explains each season by its effect on food', () => {
    expect(seasonNote(worldAt(0)).body).toBe('Food is plentiful.')
    expect(seasonNote(worldAt(SEASON_TICKS)).body).toBe('Food growth is slowing ahead of winter.')
    expect(seasonNote(worldAt(2 * SEASON_TICKS)).body).toBe('Food is scarce. Winter is the hardest season.')
    expect(seasonNote(worldAt(3 * SEASON_TICKS)).body).toBe(
      'The land is recovering. Food starts growing back.',
    )
  })

  it('warns about a hard winter ahead, with what to plant', () => {
    const note = seasonNote(worldAt(SEASON_TICKS, { hard_winter_ahead: true }))
    expect(note.title).toBe('autumn · hard winter ahead')
    expect(note.how).toBe('Plant crops and orchards now, before the cold comes.')
  })

  it('describes a hard winter that has come', () => {
    const note = seasonNote(worldAt(2 * SEASON_TICKS, { hard_winter: true }))
    expect(note.title).toBe('hard winter')
    expect(note.how).toBe('Tribes will pray for food and cures.')
  })
})
