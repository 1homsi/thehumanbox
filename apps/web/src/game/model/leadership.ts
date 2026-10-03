import type { WorldState } from '../../shared/types'

export interface Leadership {
  government: string
  leader: { id: string; name: string } | null
}

const pretty = (s: string) => s.replace(/[-_]/g, ' ')

/** How a tribe is ruled and by whom, if it has a government at all. */
export function leadershipOf(
  world: Pick<WorldState, 'governments' | 'organisms'>,
  lineage: string,
): Leadership | null {
  const gov = world.governments?.find((g) => g.lineage_id === lineage)
  if (!gov) return null
  const leader = gov.leader_id
    ? world.organisms.find((o) => o.id === gov.leader_id && o.alive !== false)
    : undefined
  return {
    government: pretty(gov.kind),
    leader: leader ? { id: leader.id, name: leader.name } : null,
  }
}
