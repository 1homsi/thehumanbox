import { describe, expect, it } from 'vitest'
import type { WorldState } from '../../shared/types'
import { eraNameOf, goodsOfTribe, territoryCardFacts, tradeOfTribe } from './territory-card'

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
      {
        id: 7,
        route_id: 1,
        sender_lineage: 'blue',
        receiver_lineage: 'red',
        cargo: 'food',
        unit_price: 4,
      },
      {
        id: 8,
        route_id: 2,
        sender_lineage: 'green',
        receiver_lineage: 'blue',
        cargo: 'wood',
        unit_price: 2,
      },
    ],
  } as unknown as Partial<WorldState>)

  it('says how many routes a tribe is on, the goods they carried, and the caravans on the road', () => {
    expect(tradeOfTribe(traded, 'red')).toBe(
      '1 route · 9 goods · 1 caravan on the road · buying food at 4 each',
    )
    expect(tradeOfTribe(traded, 'blue')).toBe(
      '2 routes · 13 goods · 2 caravans on the road · buying wood at 2 each',
    )
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
    expect(territoryCardFacts(traded, 'red', false).trade).toBe(
      '1 route · 9 goods · 1 caravan on the road · buying food at 4 each',
    )
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

describe('territory card goods line', () => {
  it('names the land goods a tribe holds, most first', () => {
    const held = { land_goods: { red: { salt: 2, clay: 5, fur: 0 } } }
    expect(goodsOfTribe(held, 'red')).toBe('holds 5 clay, 2 salt')
  })

  it('shows nothing for a tribe that holds no land goods', () => {
    expect(goodsOfTribe({ land_goods: { red: {} } }, 'red')).toBeNull()
    expect(goodsOfTribe({}, 'blue')).toBeNull()
  })

  it('puts the goods line in the card facts', () => {
    const facts = territoryCardFacts(
      world({ land_goods: { red: { ore: 3 } } } as Partial<WorldState>),
      'red',
      false,
    )
    expect(facts.goods).toBe('holds 3 ore')
  })
})

describe('territory card agreement and embargo', () => {
  it('names a trade agreement on a route between two tribes', () => {
    const agreed = world({
      trade_routes: [
        { id: 1, lineage_a: 'red', lineage_b: 'blue', volume: 0, deliveries: 0, agreement: true },
      ],
    } as Partial<WorldState>)
    expect(tradeOfTribe(agreed, 'red')).toBe('1 route · trade agreement')
  })

  it('names a war that closes the route, which outranks the agreement', () => {
    const war = world({
      trade_routes: [
        {
          id: 1,
          lineage_a: 'red',
          lineage_b: 'blue',
          volume: 0,
          deliveries: 0,
          agreement: true,
          embargoed: true,
        },
      ],
    } as Partial<WorldState>)
    expect(tradeOfTribe(war, 'red')).toBe('1 route · embargoed by war')
  })

  it('says nothing about agreements when the route is an ordinary one', () => {
    const plain = world({
      trade_routes: [{ id: 1, lineage_a: 'red', lineage_b: 'blue', volume: 0, deliveries: 0 }],
    } as Partial<WorldState>)
    expect(tradeOfTribe(plain, 'red')).toBe('1 route')
  })
})
