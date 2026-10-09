import { describe, expect, it } from 'vitest'
import { wealthGapYears } from './wealth-history'

describe('wealthGapYears', () => {
  it('words each year with the same even, uneven and stark scale as the tribe card', () => {
    expect(wealthGapYears([0.1, 0.4, 0.7])).toEqual([
      { year: 0, gini: 0.1, word: 'even' },
      { year: 1, gini: 0.4, word: 'uneven' },
      { year: 2, gini: 0.7, word: 'stark' },
    ])
  })

  it('is empty before a year has been sampled', () => {
    expect(wealthGapYears([])).toEqual([])
  })
})
