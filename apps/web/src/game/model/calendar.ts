// The world's calendar, derived from the tick count. Mirrors
// crates/sim-core/src/sim/calendar.rs and cosmos.rs (DAY_LENGTH, SEASON_LENGTH
// and the four-season year); keep the two in step.

export const DAY_TICKS = 600
export const SEASON_TICKS = 3000
export const YEAR_TICKS = 4 * SEASON_TICKS

/** Simulation season names in the order a year runs through them. */
const SEASON_ORDER = ['abundance', 'decline', 'scarcity', 'recovery'] as const

const SEASON_NAMES: Record<string, string> = {
  abundance: 'Summer',
  decline: 'Autumn',
  scarcity: 'Winter',
  recovery: 'Spring',
}

export interface CalendarDate {
  /** Year, counted from 1. */
  year: number
  /** Name people use for the season: Spring, Summer, Autumn or Winter. */
  season: string
  /** Day within the season, counted from 1 (a season is five days). */
  dayOfSeason: number
}

export function calendarAt(tick: number): CalendarDate {
  const t = Math.max(0, Math.floor(tick))
  const intoYear = t % YEAR_TICKS
  const seasonIndex = Math.floor(intoYear / SEASON_TICKS) % SEASON_ORDER.length
  return {
    year: Math.floor(t / YEAR_TICKS) + 1,
    season: SEASON_NAMES[SEASON_ORDER[seasonIndex]],
    dayOfSeason: Math.floor((t % SEASON_TICKS) / DAY_TICKS) + 1,
  }
}

/** An age in ticks, as years: one decimal while young ("1.4 yrs"), whole years after. */
export function ageInYears(ageTicks: number): string {
  const years = ageTicks / YEAR_TICKS
  return years < 10 ? `${years.toFixed(1)} yrs` : `${Math.floor(years)} yrs`
}
