// Legends: the notable events of the world, told as titled stories. They are the
// events the sim marks as news (game/model/news.ts), newest first. Each kind has
// a title; the event's own detail says what happened.

import { t, type MessageKey } from '../../i18n'
import { calendarAt } from './calendar'
import { isNewsEvent } from './news'

export interface Legend {
  tick: number
  /** When it happened, e.g. "Year 3, Winter". */
  when: string
  title: string
  text: string
}

/** The title of each kind of news event, as a key read with t() where it is shown. */
const TITLES = new Map<string, MessageKey>([
  ['meteor', 'model.legends.titles.meteor'],
  ['eruption', 'model.legends.titles.eruption'],
  ['battle', 'model.legends.titles.battle'],
  ['war_declared', 'model.legends.titles.warDeclared'],
  ['treaty', 'model.legends.titles.treaty'],
  ['era', 'model.legends.titles.era'],
  ['era_advance', 'model.legends.titles.eraAdvance'],
  ['milestone', 'model.legends.titles.milestone'],
  ['smite', 'model.legends.titles.smite'],
  ['answered', 'model.legends.titles.answered'],
  ['forsaken', 'model.legends.titles.forsaken'],
  ['prayer', 'model.legends.titles.prayer'],
  ['outbreak', 'model.legends.titles.outbreak'],
  ['disease_death', 'model.legends.titles.diseaseDeath'],
  ['building_ruined', 'model.legends.titles.buildingRuined'],
  ['weather', 'model.legends.titles.weather'],
  ['drought', 'model.legends.titles.drought'],
  ['danger', 'model.legends.titles.danger'],
])

/** The panel's name for each season the calendar counts (see calendarAt). */
const SEASON_KEY: Record<string, MessageKey> = {
  Spring: 'panels.calendar.seasonName.spring',
  Summer: 'panels.calendar.seasonName.summer',
  Autumn: 'panels.calendar.seasonName.autumn',
  Winter: 'panels.calendar.seasonName.winter',
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
      const seasonKey = SEASON_KEY[d.season]
      const titleKey = TITLES.get(e.type)
      return {
        tick: e.tick,
        when: t('model.legends.when', { year: d.year, season: seasonKey ? t(seasonKey) : d.season }),
        title: titleKey ? t(titleKey) : t('model.legends.notable'),
        text: e.detail,
      }
    })
}
