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
  trade: string | null
  contested: boolean
}

/**
 * A tribe's trade in a few words: the routes it is on, the goods those routes
 * have carried, and the caravans on the road to or from it. Null while the tribe
 * has no route, so a tribe that does not trade shows nothing.
 */
export function tradeOfTribe(
  world: Pick<WorldState, 'trade_routes' | 'caravans'>,
  lineage: string,
): string | null {
  const routes = (world.trade_routes ?? []).filter(
    (route) => route.lineage_a === lineage || route.lineage_b === lineage,
  )
  if (routes.length === 0) return null
  const goods = routes.reduce((sum, route) => sum + route.volume, 0)
  const onRoad = (world.caravans ?? []).filter(
    (caravan) => caravan.sender_lineage === lineage || caravan.receiver_lineage === lineage,
  ).length
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
  const parts = [plural(routes.length, 'route', 'routes')]
  // A first caravan still on the road has delivered nothing yet, so no goods are named.
  if (goods > 0) parts.push(plural(goods, 'good', 'goods'))
  if (onRoad > 0) parts.push(`${plural(onRoad, 'caravan', 'caravans')} on the road`)
  return parts.join(' · ')
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
    trade: tradeOfTribe(world, lineage),
    contested,
  }
}
