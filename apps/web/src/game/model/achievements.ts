import type { OrganismState, WorldState } from '../../shared/types'
import { t } from '../../i18n'
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
      title: t('model.achievements.fullYear.title'),
      detail: t('model.achievements.fullYear.detail'),
      unlocked: world.tick >= YEAR_TICKS,
      progress:
        world.tick >= YEAR_TICKS
          ? undefined
          : t('model.achievements.fullYear.progress', {
              percent: Math.floor((world.tick / YEAR_TICKS) * 100),
            }),
    },
    {
      id: 'hundred-souls',
      title: t('model.achievements.hundredSouls.title'),
      detail: t('model.achievements.hundredSouls.detail', { goal: POPULATION_GOAL }),
      unlocked: population >= POPULATION_GOAL,
      progress:
        population >= POPULATION_GOAL
          ? undefined
          : t('model.progressOf', { done: population, total: POPULATION_GOAL }),
    },
    {
      id: 'village',
      title: t('model.achievements.village.title'),
      detail: t('model.achievements.village.detail'),
      unlocked: settlements.some((s) => s.tier >= 2),
    },
    {
      id: 'three-tribes',
      title: t('model.achievements.threeTribes.title'),
      detail: t('model.achievements.threeTribes.detail'),
      unlocked: tribes >= TRIBE_GOAL,
      progress: tribes >= TRIBE_GOAL ? undefined : t('model.progressOf', { done: tribes, total: TRIBE_GOAL }),
    },
    {
      id: 'grandchildren',
      title: t('model.achievements.grandchildren.title'),
      detail: t('model.achievements.grandchildren.detail'),
      unlocked: oldestGeneration >= 2,
    },
    {
      id: 'ruler',
      title: t('model.achievements.ruler.title'),
      detail: t('model.achievements.ruler.detail'),
      unlocked: alive.some((o) => o.is_leader === true),
    },
    {
      id: 'elder',
      title: t('model.achievements.elder.title'),
      detail: t('model.achievements.elder.detail'),
      unlocked: alive.some((o) => o.is_elder),
    },
    {
      id: 'toolmakers',
      title: t('model.achievements.toolmakers.title'),
      detail: t('model.achievements.toolmakers.detail'),
      unlocked: alive.some((o) => o.tools !== undefined && Object.keys(o.tools).length > 0),
    },
    {
      id: 'first-road',
      title: t('model.achievements.firstRoad.title'),
      detail: t('model.achievements.firstRoad.detail'),
      unlocked: roads >= 1,
    },
    {
      id: 'road-network',
      title: t('model.achievements.roadNetwork.title'),
      detail: t('model.achievements.roadNetwork.detail', { goal: ROAD_GOAL }),
      unlocked: roads >= ROAD_GOAL,
      progress: roads >= ROAD_GOAL ? undefined : t('model.progressOf', { done: roads, total: ROAD_GOAL }),
    },
    {
      id: 'over-the-water',
      title: t('model.achievements.overTheWater.title'),
      detail: t('model.achievements.overTheWater.detail'),
      unlocked: bridges >= 1,
    },
  ]
}
