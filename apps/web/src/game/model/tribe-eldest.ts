// The eldest living member of each tribe, for the tribe card. Ages are in
// ticks; a day is 600 ticks (the same as DAY_LENGTH in
// ui/panels/org-detail/format.ts). Ages are rounded to whole days so the card
// only changes once a day, not on every tick.

const DAY_TICKS = 600

export interface Eldest {
  name: string
  days: number
}

/** The oldest living person in each tribe, keyed by lineage id. */
export function eldestByLineage(
  organisms: ReadonlyArray<{
    alive: boolean
    lineage_id?: string
    age: number
    name: string
    custom_name?: string
  }>,
): Record<string, Eldest> {
  const out: Record<string, Eldest> = {}
  const oldest: Record<string, number> = {}
  for (const o of organisms) {
    if (!o.alive || !o.lineage_id) continue
    const cur = oldest[o.lineage_id]
    if (cur === undefined || o.age > cur) {
      oldest[o.lineage_id] = o.age
      out[o.lineage_id] = {
        name: o.custom_name?.trim() || o.name,
        days: Math.floor(o.age / DAY_TICKS),
      }
    }
  }
  return out
}

/** The card line for an eldest member: "Anna, 41 days old". */
export function eldestLine(e: Eldest): string {
  return `${e.name}, ${e.days} day${e.days === 1 ? '' : 's'} old`
}

/**
 * An eldest as one string, for a `useShallow` selector that must compare by value. The name is free text and
 * may hold any character, so it goes last and the days first: the split is at the first `|`.
 */
export function packEldest(e: Eldest): string {
  return `${e.days}|${e.name}`
}

export function unpackEldest(packed: string | undefined): Eldest | undefined {
  if (packed === undefined) return undefined
  const bar = packed.indexOf('|')
  return { days: Number(packed.slice(0, bar)), name: packed.slice(bar + 1) }
}
