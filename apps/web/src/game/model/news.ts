// What the event log's "important" view shows.

/**
 * Older snapshots carry no `news` flag; these mirror the sim's `is_news`
 * so their logs filter the same way. Every death and every scuffle used to
 * count as important, which buried the news under chatter.
 */
const NEWS_EVENT_TYPES = new Set([
  'prayer',
  'answered',
  'forsaken',
  'outbreak',
  'building_ruined',
  'meteor',
  'era',
  'era_advance',
  'disease_death',
  'smite',
  'war_declared',
  'battle',
  'treaty',
  'weather',
  'drought',
  'milestone',
  'eruption',
  'danger',
])

export function isNewsEvent(e: { type: string; news?: boolean }): boolean {
  return e.news ?? NEWS_EVENT_TYPES.has(e.type)
}
