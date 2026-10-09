import { describe, expect, it } from 'vitest'
import { yearlySeries } from './yearly'

describe('yearlySeries', () => {
  it('lines births and deaths up by year, from year 0', () => {
    expect(yearlySeries([3, 5], [1, 0])).toEqual([
      { year: 0, births: 3, deaths: 1 },
      { year: 1, births: 5, deaths: 0 },
    ])
  })

  it('pads the shorter list with zeros', () => {
    expect(yearlySeries([2], [0, 0, 4])).toEqual([
      { year: 0, births: 2, deaths: 0 },
      { year: 1, births: 0, deaths: 0 },
      { year: 2, births: 0, deaths: 4 },
    ])
  })

  it('is empty before any year has been counted', () => {
    expect(yearlySeries([], [])).toEqual([])
  })
})
