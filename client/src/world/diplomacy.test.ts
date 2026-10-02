import { describe, expect, it } from 'vitest'
import { relationsLine, relationsOf } from './diplomacy'

const world = {
  lineage_names: { a: 'Ashfolk', b: 'Lupif', c: 'Pamil', d: 'Jijo' },
  treaties: [
    { tick: 1, a_lineage: 'a', b_lineage: 'b', kind: 'alliance' },
    { tick: 2, a_lineage: 'c', b_lineage: 'a', kind: 'trade' },
    { tick: 3, a_lineage: 'a', b_lineage: 'd', kind: 'vassalage' },
    { tick: 4, a_lineage: 'b', b_lineage: 'c', kind: 'alliance' },
  ],
  battles: [
    {
      id: 'x',
      attackers: ['d'],
      defenders: ['a'],
      scale: 'Raid',
      location: [1, 1],
      started_tick: 0,
      ended: false,
      casualties_a: 0,
      casualties_d: 0,
      initial_a: 1,
      initial_d: 1,
    },
  ],
} as never

describe('tribe relations', () => {
  it('sorts treaties into allies, friends and bound tribes, and finds enemies', () => {
    const r = relationsOf(world, 'a')
    expect(r.allies).toEqual(['Lupif'])
    expect(r.friends).toEqual(['Pamil'])
    expect(r.vassals).toEqual(['Jijo'])
    expect(r.enemies).toEqual(['Jijo'])
  })

  it('says it in a line, and stays quiet for a tribe alone', () => {
    expect(relationsLine(relationsOf(world, 'a'))).toBe(
      'allied with Lupif · bound to Jijo · at peace with Pamil',
    )
    expect(
      relationsLine(relationsOf({ ...(world as object), treaties: [], battles: [] } as never, 'a')),
    ).toBeNull()
  })

  it('does not count another tribes treaties', () => {
    const r = relationsOf(world, 'z')
    expect(r.allies).toEqual([])
  })
})
