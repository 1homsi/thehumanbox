import { describe, expect, it } from 'vitest'
import { eldestByLineage, eldestLine } from './tribe-eldest'

const p = (name: string, lineage_id: string, age: number, alive = true, custom_name?: string) => ({
  name,
  lineage_id,
  age,
  alive,
  custom_name,
})

describe('eldestByLineage', () => {
  it('picks the oldest living member of each tribe, in whole days', () => {
    const out = eldestByLineage([
      p('Anna', 'a', 600 * 41 + 300),
      p('Bo', 'a', 600 * 12),
      p('Cy', 'b', 600 * 80),
    ])
    expect(out.a).toEqual({ name: 'Anna', days: 41 })
    expect(out.b).toEqual({ name: 'Cy', days: 80 })
  })

  it('skips the dead, and the custom name is the one shown', () => {
    const out = eldestByLineage([p('Old', 'a', 600 * 200, false), p('Dan', 'a', 600 * 9, true, 'Dani')])
    expect(out.a).toEqual({ name: 'Dani', days: 9 })
  })

  it('has no entry for a tribe with no living members', () => {
    expect(eldestByLineage([p('Old', 'a', 600 * 200, false)])).toEqual({})
  })
})

describe('eldestLine', () => {
  it('reads the age in days, singular for one day', () => {
    expect(eldestLine({ name: 'Anna', days: 41 })).toBe('Anna, 41 days old')
    expect(eldestLine({ name: 'Bo', days: 1 })).toBe('Bo, 1 day old')
  })
})
