// The wealth gap over the years: the average of the tribes' Gini coefficients,
// sampled by the sim at the start of each calendar year (History.wealth_gap_by_year).
// Each year is worded with the same even / uneven / stark words the tribe card uses.

import { wealthGapLabel } from './inequality'

export interface GapYear {
  year: number
  gini: number
  word: string
}

export function wealthGapYears(values: readonly number[]): GapYear[] {
  return values.map((gini, year) => ({ year, gini, word: wealthGapLabel(gini) }))
}
