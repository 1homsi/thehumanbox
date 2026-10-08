import { describe, expect, it } from 'vitest'
import { ageInYears, calendarAt, YEAR_TICKS } from './calendar'

describe('calendarAt', () => {
  it('starts in summer of year one', () => {
    expect(calendarAt(0)).toEqual({ year: 1, season: 'Summer', dayOfSeason: 1 })
  })

  it('turns through the seasons and rolls the year over', () => {
    expect(calendarAt(3000).season).toBe('Autumn')
    expect(calendarAt(6000).season).toBe('Winter')
    expect(calendarAt(9000).season).toBe('Spring')
    expect(calendarAt(YEAR_TICKS - 1)).toEqual({ year: 1, season: 'Spring', dayOfSeason: 5 })
    expect(calendarAt(YEAR_TICKS)).toEqual({ year: 2, season: 'Summer', dayOfSeason: 1 })
  })

  it('counts days within a season from one', () => {
    expect(calendarAt(600 * 2).dayOfSeason).toBe(3)
    expect(calendarAt(3000 + 599).dayOfSeason).toBe(1)
  })
})

describe('ageInYears', () => {
  it('reads as years with one decimal place while young', () => {
    expect(ageInYears(YEAR_TICKS / 2)).toBe('0.5 yrs')
    expect(ageInYears(YEAR_TICKS * 3 + 1200)).toBe('3.1 yrs')
  })

  it('drops the decimal once a person is old', () => {
    expect(ageInYears(YEAR_TICKS * 12 + 9000)).toBe('12 yrs')
  })
})
