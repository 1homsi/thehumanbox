import { describe, expect, it } from 'vitest'
import type { TribeChronicleRow, WorldState } from '../../shared/types'
import { t } from '../../i18n'
import { causeText, endSummary, extinctionOf, END_SHOWN, fallenTribes } from './tribe-end'

const row = (tick: number, kind: TribeChronicleRow['kind'], extra: Partial<TribeChronicleRow> = {}) =>
  ({ tick, kind, other: null, word: null, x: null, y: null, ...extra }) as TribeChronicleRow

describe('extinctionOf', () => {
  it('is the latest extinction line, and null for a history without one', () => {
    expect(extinctionOf([row(5, 'famine'), row(9, 'extinct', { word: 'war' })])?.tick).toBe(9)
    expect(extinctionOf([row(5, 'famine')])).toBeNull()
    expect(extinctionOf(undefined)).toBeNull()
  })
})

describe('fallenTribes', () => {
  it('lists the tribes with no one alive that have an extinction line, newest first, with place and cause', () => {
    const world = {
      organisms: [
        { alive: true, lineage_id: 'alive' },
        { alive: false, lineage_id: 'old' },
        { lineage_id: 'legacy-no-flag' },
      ],
      tribe_chronicle: {
        alive: [row(40, 'extinct', { word: 'war', x: 1, y: 1 })],
        old: [row(10, 'famine'), row(20, 'extinct', { word: 'starvation', x: 3, y: 4 })],
        gone: [row(30, 'raid', { other: 'old' }), row(50, 'extinct', { word: null })],
        unending: [row(60, 'famine')],
      },
    } as unknown as Pick<WorldState, 'tribe_chronicle' | 'organisms'>

    expect(fallenTribes(world)).toEqual([
      { lineage: 'gone', tick: 50, place: null, cause: null },
      { lineage: 'old', tick: 20, place: [3, 4], cause: 'starvation' },
    ])
  })
})

describe('endSummary', () => {
  it('shows the newest lines, and only the extinction line counts as a recorded cause', () => {
    const rows = [
      row(1, 'arrival'),
      row(2, 'famine'),
      row(3, 'war', { other: 'b' }),
      row(4, 'extinct', { word: 'old_age' }),
    ]
    const lines = endSummary(rows)
    expect(lines.map((l) => l.row.kind)).toEqual(['extinct', 'war', 'famine', 'arrival'])
    expect(lines.map((l) => l.causal)).toEqual([true, false, false, false])
  })

  it('an extinction without a recorded cause is context, not a cause', () => {
    const lines = endSummary([row(4, 'extinct', { word: null })])
    expect(lines.map((l) => l.causal)).toEqual([false])
  })

  it('keeps the summary short', () => {
    const rows = Array.from({ length: END_SHOWN + 5 }, (_, i) => row(i, 'famine'))
    expect(endSummary(rows)).toHaveLength(END_SHOWN)
  })
})

describe('causeText', () => {
  it('reads a recorded cause in plain words, and passes an unknown one through', () => {
    expect(causeText('starvation')).toBe(t('model.loss.hunger'))
    expect(causeText('old_age')).toBe(t('model.loss.oldAge'))
    expect(causeText('some_new_cause')).toBe('some new cause')
  })
})
