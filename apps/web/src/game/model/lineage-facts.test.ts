import { describe, expect, it } from 'vitest'
import { factsLine, lineageFacts } from './lineage-facts'

describe('lineage facts', () => {
  const world = {
    lineage_eras: [
      { lineage_id: 'a', era_name: 'industrial' },
      { lineage_id: 'b', era_name: 'pre_stone' },
    ],
    faith: { by_lineage: { a: -10, c: 4 } },
    governments: [{ lineage_id: 'a', kind: 'city_state' }],
  } as never

  it('gathers age, faith and government by tribe', () => {
    const facts = lineageFacts(world)
    expect(facts.a).toEqual({ era: 'industrial', faith: -10, government: 'city state' })
    expect(facts.b).toEqual({ era: 'pre stone' })
    expect(facts.c).toEqual({ faith: 4 })
  })

  it('also reads eras given as a record', () => {
    expect(lineageFacts({ lineage_eras: { a: 'bronze' } } as never).a).toEqual({ era: 'bronze' })
  })

  it('reads as a line and drops what is unknown', () => {
    expect(factsLine(lineageFacts(world).a)).toBe('industrial age · city state · ✧-10')
    expect(factsLine(lineageFacts(world).c)).toBe('✧4')
    expect(factsLine(undefined)).toBe('')
  })
})
