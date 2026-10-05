import type { WorldState } from '../../shared/types'

/** The season the ground is coloured for: a hard winter frosts the land beyond an ordinary winter's browns. */
export function terrainSeason(world: Pick<WorldState, 'hard_winter' | 'season'>): string {
  return world.hard_winter && world.season === 'scarcity' ? 'hard_winter' : world.season
}
