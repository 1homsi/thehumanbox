import type { WorldState } from '../../shared/types'
import { wealthGapOf } from './inequality'
import { leadershipOf } from './leadership'

/** What the hover card says about a tribe whose land the pointer rests on. */
export interface TerritoryCardFacts {
  name: string
  people: number
  leader: string | null
  government: string | null
  era: string | null
  wealthGap: string | null
  contested: boolean
}

/** A tribe's era in words, from the simulation's lineage eras (a list of rows or a map). */
export function eraNameOf(world: Pick<WorldState, 'lineage_eras'>, lineage: string): string | null {
  const eras = world.lineage_eras
  if (!eras) return null
  const raw = Array.isArray(eras) ? eras.find((row) => row.lineage_id === lineage)?.era_name : eras[lineage]
  return raw ? raw.replace(/[-_]/g, ' ') : null
}

/** The facts a tribe's territory card shows: name, people alive, who leads it, its era and wealth gap. */
export function territoryCardFacts(
  world: WorldState,
  lineage: string,
  contested: boolean,
): TerritoryCardFacts {
  const leadership = leadershipOf(world, lineage)
  return {
    name: world.lineage_names?.[lineage] ?? lineage,
    people: world.organisms.filter((o) => o.alive && o.lineage_id === lineage).length,
    leader: leadership?.leader?.name ?? null,
    government: leadership?.government ?? null,
    era: eraNameOf(world, lineage),
    wealthGap: wealthGapOf(world.lineage_inequality, lineage),
    contested,
  }
}
