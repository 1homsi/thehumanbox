import { describe, expect, it } from 'vitest'
import type { WorldState } from '../../shared/types'
import { everLived, livingCount, worldEpitaph } from './world-end'

const world = (over: Partial<WorldState>): WorldState =>
  ({ tick: 5000, organisms: [], pop_history: [], ...over }) as unknown as WorldState

describe('world end', () => {
  it('counts the living and only mourns a world that had people', () => {
    expect(livingCount(world({ organisms: [{ alive: true }, { alive: false }] as never }))).toBe(1)
    expect(everLived(world({}))).toBe(false)
    expect(
      everLived(
        world({
          pop_history: [
            [100, 0],
            [200, 12],
          ],
        }),
      ),
    ).toBe(true)
  })

  it('sums up what the world achieved', () => {
    const e = worldEpitaph(
      world({
        cosmos: { year: 6 } as never,
        pop_history: [
          [100, 40],
          [200, 212],
          [300, 0],
        ],
        lineage_names: { a: 'Ashari', b: 'Bel' },
        lineage_eras: [
          { lineage_id: 'a', era_name: 'stone' },
          { lineage_id: 'b', era_name: 'medieval' },
        ],
        faith: { by_lineage: {}, answered: 4, forsaken: 2, blessed: [], despairing: [] },
      }),
    )
    expect(e).toEqual({ years: 7, peak: 212, tribes: 2, era: 'medieval', answered: 4, forsaken: 2 })
  })
})
