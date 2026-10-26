import { describe, expect, it } from 'vitest'
import type { TribeChronicleRow } from '../../shared/types'
import { historyRows, HISTORY_SHOWN, placeOf } from './tribe-history'

const row = (tick: number, over: Partial<TribeChronicleRow> = {}): TribeChronicleRow => ({
  tick,
  kind: 'famine',
  other: null,
  word: null,
  x: null,
  y: null,
  ...over,
})

describe('historyRows', () => {
  it('lists the newest lines first and keeps only the latest few', () => {
    const entries = Array.from({ length: HISTORY_SHOWN + 3 }, (_, i) => row(i * 10))
    const rows = historyRows(entries)
    expect(rows).toHaveLength(HISTORY_SHOWN)
    expect(rows[0]!.tick).toBe((HISTORY_SHOWN + 2) * 10)
    expect(rows[rows.length - 1]!.tick).toBe(3 * 10)
  })

  it('is empty for a tribe with no history', () => {
    expect(historyRows(undefined)).toEqual([])
    expect(historyRows([])).toEqual([])
  })
})

describe('placeOf', () => {
  it('gives the tile a line happened at, and nothing when the sim named no place', () => {
    expect(placeOf(row(1, { x: 4, y: 9 }))).toEqual([4, 9])
    expect(placeOf(row(1))).toBeNull()
    expect(placeOf(row(1, { x: 4, y: null }))).toBeNull()
  })
})
