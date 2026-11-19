import { describe, expect, it } from 'vitest'
import type { TownInfo, WorldState } from '../../shared/types'
import { townLine, townNear, townRoleWord } from './town-role'
import { territoryCardFacts } from './territory-card'

const towns: TownInfo[] = [
  {
    id: 1,
    lineage_id: 'red',
    center: [10, 10],
    planned: true,
    role: 'mining',
    short: ['food'],
    spare: ['stone'],
  },
  { id: 2, lineage_id: 'red', center: [40, 10], planned: true, role: 'harbour' },
  { id: 3, lineage_id: 'blue', center: [12, 10], planned: true, role: 'farming' },
  { id: 4, lineage_id: 'red', center: [200, 200], planned: false },
]

describe('town roles', () => {
  it('names each role in words', () => {
    expect(townRoleWord('mining')).toBe('a mining town')
    expect(townRoleWord('trade')).toBe('a trade hub')
    expect(townRoleWord('capital')).toBe('the capital')
    expect(townRoleWord(undefined)).toBeNull()
  })

  it('finds the nearest town of the tribe within reach', () => {
    const world = { towns }
    expect(townNear(world, 'red', 14, 12)?.id).toBe(1)
    expect(townNear(world, 'red', 33, 10)?.id).toBe(2)
    expect(townNear(world, 'blue', 14, 12)?.id).toBe(3)
    expect(townNear(world, 'red', 120, 120)).toBeNull()
  })

  it('says what the town is, what it lacks and what it has to spare', () => {
    expect(townLine(towns[0]!)).toBe('a mining town · short of food · stone to spare')
    expect(townLine(towns[1]!)).toBe('a harbour town')
    expect(townLine(towns[3]!)).toBeNull()
    expect(townLine(null)).toBeNull()
  })

  it('puts the town under the pointer on the territory card', () => {
    const world = {
      organisms: [{ id: 'a', alive: true, lineage_id: 'red', name: 'Ada' }],
      lineage_names: { red: 'The Reds' },
      towns,
    } as unknown as WorldState
    expect(territoryCardFacts(world, 'red', false, { x: 11, y: 9 }).town).toBe(
      'a mining town · short of food · stone to spare',
    )
    expect(territoryCardFacts(world, 'red', false).town).toBeNull()
  })
})
