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
  water: number
  health: number
  sick: number
  faith: number
  blessed: boolean
  despairing: boolean
  /** Gave up on the gods: rarely prays until helped unasked. */
  lostFaith: boolean
  prayer: PrayerInfo | null
  /** What stands between the tribe and its next age, if there is one. */
  nextAge: {
    era: string
    known: number
    required: number
    missing: string[]
    peopleNeeded: number
  } | null
}

function eraOf(world: WorldState, id: string): string | null {
  const eras = world.lineage_eras
  if (!eras) return null
  if (Array.isArray(eras)) return eras.find((e) => e.lineage_id === id)?.era_name ?? null
  return eras[id] ?? null
}

const pretty = (s: string) => s.replace(/[-_]/g, ' ')

function nextAgeOf(world: WorldState, id: string): TribeStatus['nextAge'] {
  const p = world.lineage_era_progress?.find((e) => e.lineage_id === id)
  if (!p?.next_era) return null
  return {
    era: pretty(p.next_era),
    known: p.known.length,
    required: p.required.length,
    missing: p.missing.map(pretty),
    peopleNeeded: p.pop_ready ? 0 : Math.max(0, p.pop_required - p.pop),
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
    sick: members.filter((o) => o.infection > 0.3).length,
    faith: faith?.by_lineage[id] ?? 0,
    blessed: !!faith?.blessed.includes(id),
    despairing: !!faith?.despairing.includes(id),
    lostFaith: (faith?.by_lineage[id] ?? 0) <= LOST_FAITH,
    prayer: world.prayers?.find((p) => p.lineage_id === id) ?? null,
    nextAge: nextAgeOf(world, id),
  }
}
