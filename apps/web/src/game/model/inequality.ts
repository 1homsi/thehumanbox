// How unequally a tribe's wealth is shared, in words. The simulation sends a
// Gini coefficient per tribe (0 when everyone holds the same, near 1 when one
// person holds almost all of it); see sim/civ/society/inequality.rs.

export interface LineageInequality {
  lineage_id: string
  gini: number
  people: number
}

/** A word for a Gini coefficient: how far the tribe's wealth is spread. */
export function wealthGapLabel(gini: number): string {
  if (gini < 0.3) return 'even'
  if (gini < 0.5) return 'uneven'
  return 'stark'
}

/** The wealth gap of one tribe, if the simulation reported it (tribes of four or more). */
export function wealthGapOf(rows: LineageInequality[] | undefined, lineage: string): string | null {
  const row = rows?.find((r) => r.lineage_id === lineage)
  return row ? wealthGapLabel(row.gini) : null
}
