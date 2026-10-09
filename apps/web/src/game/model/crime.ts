// Crime in a tribe, in words. The simulation sends each tribe's thefts,
// killings and caught thefts (see sim/civ/society/crime.rs).

export interface LineageCrime {
  lineage_id: string
  thefts: number
  murders: number
  punished: number
}

/** "2 thefts, 1 killing" for a tribe that has had crime, or null when it has none. */
export function crimeLineOf(rows: LineageCrime[] | undefined, lineage: string): string | null {
  const row = rows?.find((r) => r.lineage_id === lineage)
  if (!row || row.thefts <= 0) return null
  const thefts = `${row.thefts} ${row.thefts === 1 ? 'theft' : 'thefts'}`
  if (row.murders <= 0) return thefts
  return `${thefts}, ${row.murders} ${row.murders === 1 ? 'killing' : 'killings'}`
}
