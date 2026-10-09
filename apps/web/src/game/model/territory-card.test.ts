import { describe, expect, it } from 'vitest'
import type { WorldState } from '../../shared/types'
import { eraNameOf, territoryCardFacts } from './territory-card'

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
