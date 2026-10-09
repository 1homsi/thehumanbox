import { describe, expect, it } from 'vitest'
import type { WorldState } from '../../shared/types'
import { tribeStatus } from './tribe-status'

const person = (lineage_id: string) =>
  ({ alive: true, lineage_id, energy: 0.8, hydration: 0.8, health: 0.9, infection: 0 }) as never

const base = {
  tick: 10,
  organisms: [person('a'), person('b')],
  lineage_names: { a: 'Ashari', b: 'Bedu' },
  lineage_eras: [],
  faith: { by_lineage: {}, answered: 0, forsaken: 0, blessed: [], despairing: [] },
  prayers: [],
  lineage_era_progress: [],
} as unknown as WorldState

describe('tribe food stores', () => {
  it('shows the grain in the tribe granaries, and nothing for a tribe without one', () => {
    const world = { ...base, lineage_food_stores: [{ lineage_id: 'a', stock: 42 }] } as WorldState
    expect(tribeStatus(world, 'a')?.stores).toBe(42)
    expect(tribeStatus(world, 'b')?.stores).toBe(0)
  })

  it('reads zero when the frame has no stores yet (an older world)', () => {
    expect(tribeStatus(base, 'a')?.stores).toBe(0)
  })

  it('shows the livestock each tribe keeps in its pens, and none for a tribe without a pen', () => {
    const world = { ...base, lineage_livestock: [{ lineage_id: 'a', head: 5 }] } as WorldState
    expect(tribeStatus(world, 'a')?.livestock).toBe(5)
    expect(tribeStatus(world, 'b')?.livestock).toBe(0)
    expect(tribeStatus(base, 'a')?.livestock).toBe(0)
  })
})
