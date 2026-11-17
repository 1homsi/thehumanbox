import type { WorldState } from '../../shared/types'

export function headerPopulation(world: WorldState | null, livePeople: number | undefined): number {
  if (livePeople !== undefined) return livePeople
  return world?.lineage_sizes?.reduce((total, lineage) => total + lineage.count, 0) ?? 0
}
