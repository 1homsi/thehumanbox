import { describe, expect, it } from 'vitest'
import type { BattleInfo } from '../../types'
import { activeBattles, AFTERMATH_TICKS, battleAge, battleRadius, enemiesOf, plaqueText } from './battles'

function battle(attackers: string[], defenders: string[], ended = false, scale = 'Skirmish'): BattleInfo {
  return {
    id: `${attackers}-${defenders}`,
    attackers,
    defenders,
    scale,
    location: [10, 10],
    started_tick: 5,
    ended,
    casualties_a: 1,
    casualties_d: 2,
    initial_a: 5,
    initial_d: 5,
  }
}

describe('battles on the map', () => {
  it('shows only the battles still being fought', () => {
    expect(activeBattles([battle(['a'], ['b']), battle(['c'], ['d'], true)])).toHaveLength(1)
    expect(activeBattles(undefined)).toEqual([])
  })

  it('knows who a tribe is fighting, on either side', () => {
    const battles = [battle(['a'], ['b']), battle(['c'], ['a']), battle(['x'], ['a'], true)]
    expect(enemiesOf(battles, 'a')).toEqual(['b', 'c'])
    expect(enemiesOf(battles, 'b')).toEqual(['a'])
    expect(enemiesOf(battles, 'z')).toEqual([])
  })

  it('spreads wider for bigger fights', () => {
    expect(battleRadius('War')).toBeGreaterThan(battleRadius('Battle'))
    expect(battleRadius('Battle')).toBeGreaterThan(battleRadius('Skirmish'))
  })

  it('leaves its dead on the field for a while after it ends', () => {
    const fought = battle(['a'], ['b'])
    expect(battleAge(fought, 100)).toBe(0)
    const over = { ...battle(['a'], ['b'], true), ended_tick: 1000 }
    expect(battleAge(over, 1000)).toBe(0)
    expect(battleAge(over, 1000 + AFTERMATH_TICKS / 2)).toBeCloseTo(0.5)
    expect(battleAge(over, 1000 + AFTERMATH_TICKS)).toBeNull()
    expect(battleAge(battle(['a'], ['b'], true), 1000)).toBeNull()
  })

  it('names the fight and counts its dead', () => {
    expect(plaqueText({ ...battle(['a'], ['b']), scale: 'Raid' })).toBe('raid · 3 fallen')
    expect(plaqueText({ ...battle(['a'], ['b']), scale: 'War', casualties_a: 0, casualties_d: 0 })).toBe(
      'war',
    )
  })
})
