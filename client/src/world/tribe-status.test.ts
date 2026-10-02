import { describe, expect, it } from 'vitest'
import type { WorldState } from '../types'
import { tribeStatus } from './tribe-status'

const person = (lineage_id: string, energy: number, infection = 0) =>
  ({ alive: true, lineage_id, energy, hydration: 0.8, health: 0.9, infection }) as never

describe('tribe status', () => {
  const world = {
    tick: 10,
    organisms: [person('a', 0.2, 0.6), person('a', 0.6), person('b', 1)],
    lineage_names: { a: 'Ashari' },
    lineage_eras: [{ lineage_id: 'a', era_name: 'pre-stone' }],
    faith: { by_lineage: { a: 3 }, answered: 3, forsaken: 0, blessed: ['a'], despairing: [] },
    prayers: [
      { id: 1, lineage_id: 'a', tribe: 'Ashari', kind: 'hunger', x: 1, y: 1, created: 0, expires: 9 },
    ],
  } as unknown as WorldState

  it('averages needs over living members and gathers faith and prayers', () => {
    const s = tribeStatus(world, 'a')!
    expect(s.name).toBe('Ashari')
    expect(s.era).toBe('pre stone')
    expect(s.people).toBe(2)
    expect(s.food).toBeCloseTo(0.4)
    expect(s.sick).toBe(1)
    expect(s.faith).toBe(3)
    expect(s.blessed).toBe(true)
    expect(s.prayer?.kind).toBe('hunger')
  })

  it('is empty for a tribe with nobody left', () => {
    expect(tribeStatus(world, 'gone')).toBeNull()
  })
})
