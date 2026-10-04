import type { WorldState } from '../../shared/types'
import { eraTier } from './era-tier'

export interface WorldEpitaph {
  years: number
  peak: number
  tribes: number
  era: string | null
  answered: number
  forsaken: number
}

export function livingCount(world: WorldState): number {
  let n = 0
  for (const o of world.organisms) if (o.alive) n++
  return n
}

/** True once anyone has ever lived here, so a fresh empty world isn't mourned. */
export function everLived(world: WorldState): boolean {
  return (
    (world.pop_history ?? []).some(([, pop]) => pop > 0) || Object.keys(world.lineage_names ?? {}).length > 0
  )
}

function highestEra(world: WorldState): string | null {
  const eras = world.lineage_eras
  const names = Array.isArray(eras) ? eras.map((e) => e.era_name) : Object.values(eras ?? {})
  let best: string | null = null
  for (const name of names) if (!best || eraTier(name) > eraTier(best)) best = name
  return best
}

/** What the world achieved before it fell silent. */
export function worldEpitaph(world: WorldState): WorldEpitaph {
  return {
    years: (world.cosmos?.year ?? 0) + 1,
    peak: Math.max(0, ...(world.pop_history ?? []).map(([, pop]) => pop)),
    tribes: Object.keys(world.lineage_names ?? {}).length,
    era: highestEra(world)?.replace(/[-_]/g, ' ') ?? null,
    answered: world.faith?.answered ?? 0,
    forsaken: world.faith?.forsaken ?? 0,
  }
}
