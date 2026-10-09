import { calendarAt } from '../../game/model/calendar'
import { vegetationSeason } from '../../game/render/landscape-style'
import type { WorldState } from '../../shared/types'

/** The part of the day the light is in. The thresholds are the sky's (render/cf/overlays/atmosphere.ts). */
export type DayPhase = 'dawn' | 'day' | 'dusk' | 'night'

export const DAY_PHASE_ICON: Record<DayPhase, string> = {
  dawn: '🌅',
  day: '☀️',
  dusk: '🌇',
  night: '🌙',
}

export const DAY_PHASE_TITLE: Record<DayPhase, string> = {
  dawn: 'Dawn',
  day: 'Daytime',
  dusk: 'Dusk',
  night: 'Nighttime',
}

type DayWorld = Pick<WorldState, 'is_day' | 'day_progress'>

export function dayPhase(world: DayWorld): DayPhase {
  if (!world.is_day) return 'night'
  const progress = world.day_progress ?? 0.5
  if (progress < 0.12) return 'dawn'
  if (progress > 0.55) return 'dusk'
  return 'day'
}

// The simulation names seasons by what they do to food; the header shows
// the calendar name (autumn used to read as "decline", as if the world
// were dying) and explains the effect in the tooltip.
const SEASON_TIPS: Record<string, string> = {
  recovery: 'The land is recovering. Food starts growing back.',
  abundance: 'Food is plentiful.',
  decline: 'Food growth is slowing ahead of winter.',
  scarcity: 'Food is scarce. Winter is the hardest season.',
}

type TagWorld = Pick<
  WorldState,
  'tick' | 'season' | 'is_day' | 'day_progress' | 'hard_winter' | 'hard_winter_ahead'
>

export interface CalendarTagParts {
  /** Year, counted from 1. */
  year: number
  /** Calendar season name for the tooltip title: "Summer". */
  calendarSeason: string
  /** Day within the season, counted from 1. */
  dayOfSeason: number
  /** The season as the tag shows it: "summer", or "hard winter" in a hard winter. */
  seasonWord: string
  /** The simulation's season key, which picks the season's colour (`season-abundance`, ...). */
  seasonClass: string
  hardWinter: boolean
  /** A hard winter is coming, not here yet: the tag shows a snowflake. */
  hardWinterAhead: boolean
  phase: DayPhase
  /** Percent through the day, for the tooltip. */
  dayPercent: number
}

/** Everything the one time tag says, derived from the world's tick and the season and light fields. */
export function calendarTagParts(world: TagWorld): CalendarTagParts {
  const date = calendarAt(world.tick)
  const hardWinter = !!world.hard_winter
  const season = vegetationSeason(world.season)
  return {
    year: date.year,
    calendarSeason: date.season,
    dayOfSeason: date.dayOfSeason,
    seasonWord: hardWinter ? 'hard winter' : season,
    seasonClass: world.season,
    hardWinter,
    hardWinterAhead: !hardWinter && !!world.hard_winter_ahead,
    phase: dayPhase(world),
    dayPercent: Math.round((world.day_progress ?? 0) * 100),
  }
}

/** The season's effect, in words, for the tooltip. Hard winters and their warnings say what to do about them. */
export function seasonNote(world: TagWorld): { title?: string; body: string; how?: string } {
  if (world.hard_winter) {
    return {
      title: 'hard winter',
      body: 'Colder than usual. Wild food dies back fast and fevers spread.',
      how: 'Tribes will pray for food and cures.',
    }
  }
  if (world.hard_winter_ahead) {
    return {
      title: `${vegetationSeason(world.season)} · hard winter ahead`,
      body: 'The elders fear a hard winter. Wild food will be scarce and fevers will spread.',
      how: 'Plant crops and orchards now, before the cold comes.',
    }
  }
  return { body: SEASON_TIPS[world.season] ?? 'Affects food growth and drought risk.' }
}
