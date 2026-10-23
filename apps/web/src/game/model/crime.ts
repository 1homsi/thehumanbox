// Crime in a tribe, in words. The simulation sends each tribe's thefts,
// killings and caught thefts (see sim/civ/society/crime.rs).

import { t } from '../../i18n'

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
  const thefts = t('model.crime.thefts', { count: row.thefts })
  if (row.murders <= 0) return thefts
  return t('model.crime.both', { thefts, killings: t('model.crime.killings', { count: row.murders }) })
}
