import type { OrganismState, PrayerInfo, WorldState } from '../../shared/types'

/** At or below this faith a tribe has given up on its gods (matches the sim). */
export const LOST_FAITH = -6

export interface TribeStatus {
  id: string
  name: string
  era: string | null
  people: number
  /** Averages over living members, 0..1. */
  food: number
  /** Measures of grain in the tribe's granaries. */
  stores: number
  /** Loaves in the tribe's bakeries. */
  bread: number
  /** Livestock the tribe keeps in its pens. */
  livestock: number
  water: number
  health: number
  sick: number
  faith: number
  blessed: boolean
  despairing: boolean
  /** Gave up on the gods: rarely prays until helped unasked. */
  lostFaith: boolean
  prayer: PrayerInfo | null
  /** What stands between the tribe and its next age, if there is one (see `era-guide.ts`). */
  nextAge: NextAge | null
}

export interface NextAge {
  era: string
  /** Secrets the tribe knows of those its next age needs. */
  known: number
  required: number
  /** The secrets it still lacks, all of them, in the sim's order. */
  missing: string[]
  /** People the world still needs before the age comes; 0 once it has them. */
  peopleNeeded: number
  /** People in the world now, and how many the next age needs of the world. */
  worldPeople: number
  worldPeopleRequired: number
}

function eraOf(world: WorldState, id: string): string | null {
  const eras = world.lineage_eras
  if (!eras) return null
  if (Array.isArray(eras)) return eras.find((e) => e.lineage_id === id)?.era_name ?? null
  return eras[id] ?? null
}

import { eraWord } from '../../shared/era-words'

const pretty = (s: string) => s.replace(/[-_]/g, ' ')

/**
 * The next age as the sim gates it. The age needs the secrets across the tribe's living people AND enough
 * people in the whole world (`update_lineage_eras` counts the world's population, not the tribe's). The
 * `pop_*` fields are the tribe's own count, kept for older clients; the world fields are the ones to read.
 */
function nextAgeOf(world: WorldState, id: string): NextAge | null {
  const p = world.lineage_era_progress?.find((e) => e.lineage_id === id)
  if (!p?.next_era) return null
  const worldPeople = p.world_population ?? p.pop
  const worldPeopleRequired = p.world_population_required ?? p.pop_required
  const peopleReady = p.world_population_ready ?? p.pop_ready
  return {
    era: eraWord(p.next_era),
    known: p.known.length,
    required: p.required.length,
    missing: p.missing.map(pretty),
    peopleNeeded: peopleReady ? 0 : Math.max(0, worldPeopleRequired - worldPeople),
    worldPeople,
    worldPeopleRequired,
  }
}

/** What a tribe needs right now, from its living members. */
export function tribeStatus(world: WorldState, id: string): TribeStatus | null {
  const members: OrganismState[] = world.organisms.filter((o) => o.alive && o.lineage_id === id)
  if (members.length === 0) return null
  const avg = (f: (o: OrganismState) => number) => members.reduce((s, o) => s + f(o), 0) / members.length
  const faith = world.faith
  return {
    id,
    stores: Math.max(0, world.lineage_food_stores?.find((r) => r.lineage_id === id)?.stock ?? 0),
    bread: Math.max(0, world.lineage_bread_stores?.find((r) => r.lineage_id === id)?.loaves ?? 0),
    livestock: Math.max(0, world.lineage_livestock?.find((r) => r.lineage_id === id)?.head ?? 0),
    name: world.lineage_names?.[id] ?? id.slice(0, 6),
    era: eraOf(world, id)?.replace(/[-_]/g, ' ') ?? null,
    people: members.length,
    food: Math.max(
      0,
      Math.min(
        1,
        avg((o) => o.energy),
      ),
    ),
    water: Math.max(
      0,
      Math.min(
        1,
        avg((o) => o.hydration),
      ),
    ),
    health: Math.max(
      0,
      Math.min(
        1,
        avg((o) => o.health),
      ),
    ),
    // The same line the person card, the population count and the simulation call sick (0.15).
    sick: members.filter((o) => o.infection > 0.15).length,
    faith: faith?.by_lineage[id] ?? 0,
    blessed: !!faith?.blessed.includes(id),
    despairing: !!faith?.despairing.includes(id),
    lostFaith: (faith?.by_lineage[id] ?? 0) <= LOST_FAITH,
    prayer: world.prayers?.find((p) => p.lineage_id === id) ?? null,
    nextAge: nextAgeOf(world, id),
  }
}
