import type { OrganismState, PrayerInfo, WorldState } from '../types'

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
  prayer: PrayerInfo | null
}

function eraOf(world: WorldState, id: string): string | null {
  const eras = world.lineage_eras
  if (!eras) return null
  if (Array.isArray(eras)) return eras.find((e) => e.lineage_id === id)?.era_name ?? null
  return eras[id] ?? null
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
    prayer: world.prayers?.find((p) => p.lineage_id === id) ?? null,
  }
}
