// The oldest living people in the world, for the stats panel. Ages are in
// ticks; a day is 600 ticks (the same as DAY_TICKS in game/model/calendar.ts).

import { DAY_TICKS } from './calendar'

export interface OldestPerson {
  name: string
  lineage_id: string
  days: number
}

/** The `limit` oldest living people, oldest first. Ties keep their order in the list. */
export function oldestLiving(
  organisms: ReadonlyArray<{
    alive: boolean
    age: number
    name: string
    custom_name?: string | null
    lineage_id?: string
  }>,
  limit = 5,
): OldestPerson[] {
  return organisms
    .filter((o) => o.alive)
    .slice()
    .sort((a, b) => b.age - a.age)
    .slice(0, limit)
    .map((o) => ({
      name: o.custom_name?.trim() || o.name,
      lineage_id: o.lineage_id ?? '',
      days: Math.floor(o.age / DAY_TICKS),
    }))
}
