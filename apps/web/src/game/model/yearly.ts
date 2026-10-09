// Births and deaths per calendar year, lined up for the stats chart. The sim
// keeps one count per year from year 0 (crates/sim-core/src/sim/simulation/
// types.rs: History::births_by_year, deaths_by_year). A year with no event may
// be missing from the end of either list, so both are padded to the same length.

export interface YearCount {
  year: number
  births: number
  deaths: number
}

/** The births and deaths for each year, year 0 first, padded to the longer list. */
export function yearlySeries(births: readonly number[], deaths: readonly number[]): YearCount[] {
  const n = Math.max(births.length, deaths.length)
  const out: YearCount[] = []
  for (let year = 0; year < n; year++) {
    out.push({ year, births: births[year] ?? 0, deaths: deaths[year] ?? 0 })
  }
  return out
}
