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
  goods: string | null
  contested: boolean
}

/**
 * The land goods a tribe holds (clay, salt, ore, ...), most first, in a few words. Null when
 * its people hold none, so a tribe whose ground gives nothing shows nothing.
 */
export function goodsOfTribe(world: Pick<WorldState, 'land_goods'>, lineage: string): string | null {
  const held = world.land_goods?.[lineage] ?? {}
  const parts = Object.entries(held)
    .filter(([, count]) => count > 0)
    .sort(([nameA, countA], [nameB, countB]) => countB - countA || nameA.localeCompare(nameB))
    .map(([good, count]) => `${count} ${good}`)
  return parts.length > 0 ? `holds ${parts.join(', ')}` : null
}

/**
 * A tribe's trade in a few words: the routes it is on, the goods those routes
 * have carried, the caravans on the road to or from it, and the price of the
 * goods on their way in (a scarce good sells dearer). Null while the tribe has
 * no route, so a tribe that does not trade shows nothing.
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
  const caravans = (world.caravans ?? []).filter(
    (caravan) => caravan.sender_lineage === lineage || caravan.receiver_lineage === lineage,
  )
  const inbound = caravans.find((caravan) => caravan.receiver_lineage === lineage)
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
  const parts = [plural(routes.length, 'route', 'routes')]
  if (routes.some((route) => route.embargoed)) parts.push('embargoed by war')
  else if (routes.some((route) => route.agreement)) parts.push('trade agreement')
  // A first caravan still on the road has delivered nothing yet, so no goods are named.
  if (goods > 0) parts.push(plural(goods, 'good', 'goods'))
  if (caravans.length > 0) parts.push(`${plural(caravans.length, 'caravan', 'caravans')} on the road`)
  if (inbound) parts.push(`buying ${inbound.cargo} at ${inbound.unit_price} each`)
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
    goods: goodsOfTribe(world, lineage),
    contested,
  }
}
