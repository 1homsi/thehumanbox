import { calendarAt } from '../game/model/calendar'
import { t, type MessageKey } from '../i18n'

/** The panel's name for each season the calendar counts (see calendarAt). */
const SEASON_KEY: Record<string, MessageKey> = {
  Spring: 'panels.calendar.seasonName.spring',
  Summer: 'panels.calendar.seasonName.summer',
  Autumn: 'panels.calendar.seasonName.autumn',
  Winter: 'panels.calendar.seasonName.winter',
}

/**
 * When something happened, in the same numbering as the calendar tag: "Year 2, Summer · day 3".
 * The year and the day within the season both count from 1, as the tag shows them, so a chronicle entry
 * and the tag at that tick never disagree.
 */
export function eventDate(tick: number): string {
  const date = calendarAt(tick)
  const seasonKey = SEASON_KEY[date.season]
  const when = t('model.legends.when', { year: date.year, season: seasonKey ? t(seasonKey) : date.season })
  return `${when} · ${t('dialogs.chronicles.day', { day: date.dayOfSeason })}`
}
