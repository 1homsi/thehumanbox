import { describe, expect, it } from 'vitest'
import type { WorldState } from '../../shared/types'
import { eraNameOf, territoryCardFacts, tradeOfTribe } from './territory-card'

function world(extra: Partial<WorldState> = {}): WorldState {
  return {
    organisms: [
      { id: 'a', alive: true, lineage_id: 'red', name: 'Ada' },
      { id: 'b', alive: true, lineage_id: 'red', name: 'Bo' },
      { id: 'c', alive: false, lineage_id: 'red', name: 'Cy' },
      { id: 'd', alive: true, lineage_id: 'blue', name: 'Di' },
    ],
    governments: [{ lineage_id: 'red', kind: 'council-rule', leader_id: 'a' }],
    lineage_names: { red: 'The Reds' },
    lineage_inequality: [{ lineage_id: 'red', gini: 0.62, people: 6 }],
    ...extra,
  } as unknown as WorldState
}

describe('territory card trade line', () => {
  const traded = world({
    trade_routes: [
      { id: 1, lineage_a: 'red', lineage_b: 'blue', volume: 9, deliveries: 3 },
      { id: 2, lineage_a: 'green', lineage_b: 'blue', volume: 4, deliveries: 1 },
    ],
    caravans: [
      { id: 7, route_id: 1, sender_lineage: 'blue', receiver_lineage: 'red' },
      { id: 8, route_id: 2, sender_lineage: 'green', receiver_lineage: 'blue' },
    ],
  } as unknown as Partial<WorldState>)

  it('says how many routes a tribe is on, the goods they carried, and the caravans on the road', () => {
    expect(tradeOfTribe(traded, 'red')).toBe('1 route · 9 goods · 1 caravan on the road')
    expect(tradeOfTribe(traded, 'blue')).toBe('2 routes · 13 goods · 2 caravans on the road')
  })

  it('is absent for a tribe with no route, and drops the road part when no caravan is out', () => {
    expect(tradeOfTribe(world(), 'red')).toBeNull()
    expect(
      tradeOfTribe(
        {
          trade_routes: [{ id: 3, lineage_a: 'red', lineage_b: 'blue', volume: 0, deliveries: 0 }],
          caravans: [],
        } as unknown as Pick<WorldState, 'trade_routes' | 'caravans'>,
        'red',
      ),
    ).toBe('1 route')
    expect(tradeOfTribe({ trade_routes: traded.trade_routes, caravans: [] }, 'green')).toBe(
      '1 route · 4 goods',
    )
    expect(territoryCardFacts(traded, 'red', false).trade).toBe('1 route · 9 goods · 1 caravan on the road')
  })
})

describe('territory card facts', () => {
  it('names the tribe, counts the living, and says who leads it', () => {
    const facts = territoryCardFacts(world(), 'red', false)
    expect(facts.name).toBe('The Reds')
    expect(facts.people).toBe(2)
    expect(facts.leader).toBe('Ada')
    expect(facts.government).toBe('council rule')
    expect(facts.wealthGap).toBe('stark')
    expect(facts.contested).toBe(false)
  })

  it('falls back to the lineage id and says when nobody leads', () => {
    const facts = territoryCardFacts(world({ governments: [] }), 'blue', true)
    expect(facts.name).toBe('blue')
    expect(facts.people).toBe(1)
    expect(facts.leader).toBeNull()
    expect(facts.wealthGap).toBeNull()
    expect(facts.contested).toBe(true)
  })

  it('reads the era from either shape the simulation sends', () => {
    expect(eraNameOf({ lineage_eras: [{ lineage_id: 'red', era_name: 'pre_stone' }] }, 'red')).toBe(
      'pre stone',
    )
    expect(eraNameOf({ lineage_eras: { red: 'bronze' } }, 'red')).toBe('bronze')
    expect(eraNameOf({ lineage_eras: { red: 'bronze' } }, 'blue')).toBeNull()
    expect(eraNameOf({}, 'red')).toBeNull()
  })
})
