import { describe, expect, it } from 'vitest'
import { leadershipOf } from './leadership'

const world = {
  governments: [
    { lineage_id: 'a', kind: 'chiefdom', leader_id: 'p1' },
    { lineage_id: 'b', kind: 'city_state', leader_id: 'dead' },
    { lineage_id: 'c', kind: 'tribal', leader_id: null },
  ],
  organisms: [
    { id: 'p1', name: 'Zuhe', alive: true },
    { id: 'dead', name: 'Old', alive: false },
  ],
} as never

describe('leadership', () => {
  it('names the government and its living leader', () => {
    expect(leadershipOf(world, 'a')).toEqual({ government: 'chiefdom', leader: { id: 'p1', name: 'Zuhe' } })
  })

  it('has no leader when the leader is dead or there is none', () => {
    expect(leadershipOf(world, 'b')).toEqual({ government: 'city state', leader: null })
    expect(leadershipOf(world, 'c')?.leader).toBeNull()
  })

  it('has nothing for a tribe without a government', () => {
    expect(leadershipOf(world, 'z')).toBeNull()
    expect(leadershipOf({ organisms: [] } as never, 'a')).toBeNull()
  })
})
