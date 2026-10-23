import { calendarAt } from '../../game/model/calendar'
import { vegetationSeason } from '../../game/render/landscape-style'
import { t, type MessageKey } from '../../i18n'
import type { WorldState } from '../../shared/types'

/** The part of the day the light is in. The thresholds are the sky's (render/cf/overlays/atmosphere.ts). */
export type DayPhase = 'dawn' | 'day' | 'dusk' | 'night'

export const DAY_PHASE_ICON: Record<DayPhase, string> = {
  dawn: '🌅',
  day: '☀️',
  dusk: '🌇',
  night: '🌙',
}

const DAY_PHASE_WORD: Record<DayPhase, MessageKey> = {
  dawn: 'panels.calendar.phase.dawn',
  day: 'panels.calendar.phase.day',
  dusk: 'panels.calendar.phase.dusk',
  night: 'panels.calendar.phase.night',
}

const DAY_PHASE_TITLE: Record<DayPhase, MessageKey> = {
  dawn: 'panels.calendar.phaseTitle.dawn',
  day: 'panels.calendar.phaseTitle.day',
  dusk: 'panels.calendar.phaseTitle.dusk',
  night: 'panels.calendar.phaseTitle.night',
}

type DayWorld = Pick<WorldState, 'is_day' | 'day_progress'>

export function dayPhase(world: DayWorld): DayPhase {
  if (!world.is_day) return 'night'
  const progress = world.day_progress ?? 0.5
  if (progress < 0.12) return 'dawn'
  if (progress > 0.55) return 'dusk'
  return 'day'
}

/** Season words by the simulation's vegetation name (spring, summer, autumn, winter). */
const SEASON_WORD: Record<string, MessageKey> = {
  spring: 'panels.calendar.season.spring',
  summer: 'panels.calendar.season.summer',
  autumn: 'panels.calendar.season.autumn',
  winter: 'panels.calendar.season.winter',
}

/** Season names for the tooltip title, by the same vegetation name. */
const SEASON_NAME: Record<string, MessageKey> = {
  spring: 'panels.calendar.seasonName.spring',
  summer: 'panels.calendar.seasonName.summer',
  autumn: 'panels.calendar.seasonName.autumn',
  winter: 'panels.calendar.seasonName.winter',
}

// The simulation names seasons by what they do to food; the header shows
// the calendar name (autumn used to read as "decline", as if the world
// were dying) and explains the effect in the tooltip.
const SEASON_TIPS: Record<string, MessageKey> = {
  recovery: 'panels.calendar.tip.recovery',
  abundance: 'panels.calendar.tip.abundance',
  decline: 'panels.calendar.tip.decline',
  scarcity: 'panels.calendar.tip.scarcity',
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
  /** Calendar season name for use inside a sentence: "summer". */
  calendarWord: string
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
  /** The part of the day as the tag shows it: "night". */
  phaseWord: string
  /** The part of the day as the tooltip titles it: "Nighttime". */
  phaseTitle: string
  /** Percent through the day, for the tooltip. */
  dayPercent: number
}

/** Everything the one time tag says, derived from the world's tick and the season and light fields. */
export function calendarTagParts(world: TagWorld): CalendarTagParts {
  const date = calendarAt(world.tick)
  const hardWinter = !!world.hard_winter
  const season = vegetationSeason(world.season)
  const phase = dayPhase(world)
  const calendarKey = date.season.toLowerCase()
  return {
    year: date.year,
    calendarSeason: SEASON_NAME[calendarKey] ? t(SEASON_NAME[calendarKey]) : date.season,
    calendarWord: SEASON_WORD[calendarKey] ? t(SEASON_WORD[calendarKey]) : calendarKey,
    dayOfSeason: date.dayOfSeason,
    seasonWord: hardWinter
      ? t('panels.calendar.hardWinter')
      : SEASON_WORD[season]
        ? t(SEASON_WORD[season])
        : season,
    seasonClass: world.season,
    hardWinter,
    hardWinterAhead: !hardWinter && !!world.hard_winter_ahead,
    phase,
    phaseWord: t(DAY_PHASE_WORD[phase]),
    phaseTitle: t(DAY_PHASE_TITLE[phase]),
    dayPercent: Math.round((world.day_progress ?? 0) * 100),
  }
}

/** The season's effect, in words, for the tooltip. Hard winters and their warnings say what to do about them. */
export function seasonNote(world: TagWorld): { title?: string; body: string; how?: string } {
  if (world.hard_winter) {
    return {
      title: t('panels.calendar.hardWinter'),
      body: t('panels.calendar.hardWinterBody'),
      how: t('panels.calendar.hardWinterHow'),
    }
  }
  if (world.hard_winter_ahead) {
    const season = vegetationSeason(world.season)
    return {
      title: t('panels.calendar.hardWinterAhead', {
        season: SEASON_WORD[season] ? t(SEASON_WORD[season]) : season,
      }),
      body: t('panels.calendar.aheadBody'),
      how: t('panels.calendar.aheadHow'),
    }
  }
  const key = SEASON_TIPS[world.season]
  return { body: key ? t(key) : t('panels.calendar.tip.default') }
}
