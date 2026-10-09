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

type AchievementWorld = Pick<WorldState, 'tick' | 'organisms' | 'settlements'> & {
  grid?: { roads?: number[][] }
}

const POPULATION_GOAL = 100
const TRIBE_GOAL = 3
const ROAD_GOAL = 60
/** The simulation's road kinds (see `ROAD_TRACK` and `ROAD_BRIDGE` in sim-core's grid). */
const ROAD_TRACK = 1
const ROAD_BRIDGE = 2

function living(organisms: OrganismState[]): OrganismState[] {
  return organisms.filter((o) => o.alive)
}

/** Road and bridge cells in the grid the client holds (none before the first static frame). */
function roadCountsOf(grid: AchievementWorld['grid']): { roads: number; bridges: number } {
  let roads = 0
  let bridges = 0
  for (const row of grid?.roads ?? []) {
    for (const kind of row) {
      if (kind === ROAD_TRACK) roads++
      else if (kind === ROAD_BRIDGE) bridges++
    }
  }
  return { roads, bridges }
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
  const { roads, bridges } = roadCountsOf(world.grid)

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
    {
      id: 'first-road',
      title: 'The first road',
      detail: 'The people have laid a road across the land.',
      unlocked: roads >= 1,
    },
    {
      id: 'road-network',
      title: 'A road network',
      detail: `${ROAD_GOAL} cells of road laid across the land.`,
      unlocked: roads >= ROAD_GOAL,
      progress: roads >= ROAD_GOAL ? undefined : `${roads} of ${ROAD_GOAL}`,
    },
    {
      id: 'over-the-water',
      title: 'Over the water',
      detail: 'A bridge carries the people across a river or a lake.',
      unlocked: bridges >= 1,
    },
  ]
}
