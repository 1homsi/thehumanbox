import { describe, expect, it } from 'vitest'
import { oldestLiving } from './oldest-living'

const p = (name: string, age: number, alive = true, lineage_id = 'a', custom_name?: string) => ({
  name,
  age,
  alive,
  lineage_id,
  custom_name,
})

describe('oldestLiving', () => {
  it('lists the oldest living first, in whole days, with their tribe', () => {
    expect(
      oldestLiving([p('Bo', 600 * 12, true, 'b'), p('Anna', 600 * 41 + 200), p('Cy', 600 * 3)], 2),
    ).toEqual([
      { name: 'Anna', lineage_id: 'a', days: 41 },
      { name: 'Bo', lineage_id: 'b', days: 12 },
    ])
  })

  it('leaves out the dead and uses the custom name', () => {
    const out = oldestLiving([p('Old', 600 * 300, false), p('Dan', 600 * 9, true, 'a', 'Dani')])
    expect(out).toEqual([{ name: 'Dani', lineage_id: 'a', days: 9 }])
  })

  it('stops at the limit and is empty when nobody is alive', () => {
    expect(oldestLiving([p('A', 1), p('B', 2), p('C', 3)], 2)).toHaveLength(2)
    expect(oldestLiving([p('Gone', 600, false)])).toEqual([])
  })
})
