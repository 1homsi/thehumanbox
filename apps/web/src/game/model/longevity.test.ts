import { describe, expect, it } from 'vitest'
import { longevityLines, longevityOf } from './longevity'
import { YEAR_TICKS } from './calendar'

const dead = (name: string, age: number, cause = 'old age', lineage = 'a') => ({
  alive: false,
  age,
  name,
  lineage_id: lineage,
  death_cause: cause,
})

describe('longevityOf', () => {
  it('counts only the dead who died of old age', () => {
    const world = [
      dead('Ara', 3 * YEAR_TICKS),
      dead('Bo', 9 * YEAR_TICKS, 'starvation'),
      { alive: true, age: 40 * YEAR_TICKS, name: 'Cy' },
      dead('Di', 5 * YEAR_TICKS),
    ]
    const l = longevityOf(world)
    expect(l.deaths).toBe(2)
    expect(l.longest?.name).toBe('Di')
    expect(l.averageAge).toBe(4 * YEAR_TICKS)
  })

  it('is empty while nobody has died of old age', () => {
    const l = longevityOf([{ alive: true, age: 10, name: 'x' }, dead('y', 4, 'starvation')])
    expect(l).toEqual({ deaths: 0, longest: null, averageAge: null })
    expect(longevityLines(l, () => 'tribe')).toEqual([])
  })
})

describe('longevityLines', () => {
  it('names the longest life with its tribe, and the average', () => {
    const lines = longevityLines(longevityOf([dead('Ara', 6 * YEAR_TICKS, 'old age', 'sab')]), (id) =>
      id === 'sab' ? 'Sabami' : id,
    )
    expect(lines[0]).toBe('longest life 6.0 yrs (Ara, Sabami)')
    expect(lines[1]).toBe('average 6.0 yrs over 1 old-age death')
  })
})
