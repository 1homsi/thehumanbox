// Legends: the notable events of the world, told as titled stories. They are the
// events the sim marks as news (game/model/news.ts), newest first. Each kind has
// a title; the event's own detail says what happened.

import { calendarAt } from './calendar'
import { isNewsEvent } from './news'

export interface Legend {
  tick: number
  /** When it happened, e.g. "Year 3, Winter". */
  when: string
  title: string
  text: string
}

const TITLES: Record<string, string> = {
  meteor: 'A star falls',
  eruption: 'The mountain wakes',
  battle: 'A battle',
  war_declared: 'War is declared',
  treaty: 'A treaty is sealed',
  era: 'A new age',
  era_advance: 'A tribe comes into a new age',
  milestone: 'A milestone',
  smite: "A god's wrath",
  answered: 'A prayer is answered',
  forsaken: 'A prayer goes unanswered',
  prayer: 'A prayer',
  outbreak: 'A sickness spreads',
  disease_death: 'A death to sickness',
  building_ruined: 'A building falls',
  weather: 'Strange weather',
  drought: 'A drought',
  danger: 'A danger',
}

/** The latest legends, newest first. Events that are not news are left out. */
export function legendsOf(
  events: ReadonlyArray<{ tick: number; type: string; detail: string; news?: boolean }>,
  limit = 12,
): Legend[] {
  return events
    .filter((e) => isNewsEvent({ type: e.type, news: e.news }))
    .slice()
    .sort((a, b) => b.tick - a.tick)
    .slice(0, limit)
    .map((e) => {
      const d = calendarAt(e.tick)
      return {
        tick: e.tick,
        when: `Year ${d.year}, ${d.season}`,
        title: TITLES[e.type] ?? 'A notable event',
        text: e.detail,
      }
    })
}
