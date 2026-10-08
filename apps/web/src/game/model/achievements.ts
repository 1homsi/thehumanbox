import type { OrganismState, WorldState } from '../../shared/types'
import { YEAR_TICKS } from './calendar'

export interface Achievement {
  id: string
  title: string
  detail: string
  unlocked: boolean
  /** How far along the goal is, shown while it is still locked, e.g. "37 of 100". */
  progress?: string
}

type AchievementWorld = Pick<WorldState, 'tick' | 'organisms' | 'settlements'>

const POPULATION_GOAL = 100
const TRIBE_GOAL = 3

function living(organisms: OrganismState[]): OrganismState[] {
  return organisms.filter((o) => o.alive)
}

/**
 * The achievements a world has earned right now. These are read from the live
 * world each time, so they reflect what is true at this moment and are not kept
 * as a record of past unlocks.
 */
export function achievementsFor(world: AchievementWorld): Achievement[] {
  const alive = living(world.organisms)
  const settlements = world.settlements ?? []
  const population = settlements.reduce((sum, s) => sum + s.population, 0)
  const tribes = new Set(alive.map((o) => o.lineage_id)).size
  const oldestGeneration = alive.reduce((max, o) => Math.max(max, o.generation), 0)

  return [
    {
      id: 'full-year',
      title: 'A full year',
      detail: 'The world has turned through a whole year of seasons.',
      unlocked: world.tick >= YEAR_TICKS,
      progress:
        world.tick >= YEAR_TICKS
          ? undefined
          : `${Math.floor((world.tick / YEAR_TICKS) * 100)}% of the first year`,
    },
    {
      id: 'hundred-souls',
      title: 'A hundred souls',
      detail: `Your people number ${POPULATION_GOAL} or more at once.`,
      unlocked: population >= POPULATION_GOAL,
      progress: population >= POPULATION_GOAL ? undefined : `${population} of ${POPULATION_GOAL}`,
    },
    {
      id: 'village',
      title: 'A village',
      detail: 'A tribe has grown into a village.',
      unlocked: settlements.some((s) => s.tier >= 2),
    },
    {
      id: 'three-tribes',
      title: 'Three tribes',
      detail: `Three separate tribes are alive at the same time.`,
      unlocked: tribes >= TRIBE_GOAL,
      progress: tribes >= TRIBE_GOAL ? undefined : `${tribes} of ${TRIBE_GOAL}`,
    },
    {
      id: 'grandchildren',
      title: 'Grandchildren',
      detail: 'Someone alive is a grandchild or a later descendant of the first people.',
      unlocked: oldestGeneration >= 2,
    },
    {
      id: 'ruler',
      title: 'A ruler',
      detail: 'A tribe has crowned a ruler who is still alive.',
      unlocked: alive.some((o) => o.is_leader === true),
    },
    {
      id: 'elder',
      title: 'An elder',
      detail: 'A grown person has lived long enough to be called an elder.',
      unlocked: alive.some((o) => o.is_elder),
    },
    {
      id: 'toolmakers',
      title: 'Toolmakers',
      detail: 'Someone alive carries a tool they made or were given.',
      unlocked: alive.some((o) => o.tools !== undefined && Object.keys(o.tools).length > 0),
    },
  ]
}
