import { describe, expect, it } from 'vitest'
import { wealthGapLabel, wealthGapOf } from './inequality'

describe('wealthGapLabel', () => {
  it('names how far wealth is spread', () => {
    expect(wealthGapLabel(0.1)).toBe('even')
    expect(wealthGapLabel(0.4)).toBe('uneven')
    expect(wealthGapLabel(0.62)).toBe('stark')
  })
})

describe('wealthGapOf', () => {
  const rows = [{ lineage_id: 'lin-a', gini: 0.55, people: 9 }]

  it('finds a reported tribe and says nothing for an unreported one', () => {
    expect(wealthGapOf(rows, 'lin-a')).toBe('stark')
    expect(wealthGapOf(rows, 'lin-b')).toBeNull()
    expect(wealthGapOf(undefined, 'lin-a')).toBeNull()
  })
})
