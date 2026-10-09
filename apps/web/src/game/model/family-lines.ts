// The family lines of one tribe: the surnames of its living people, most
// numerous first, with the family that holds the tribe's oldest living member
// marked as the longest-lived. A child takes the father's surname (else the
// mother's), so a surname is a family line the sim already keeps.

const DAY_TICKS = 600

export interface FamilyLine {
  surname: string
  living: number
  /** Age in whole days of the family's oldest living member. */
  eldestDays: number
  /** True for the family holding the tribe's oldest living member. */
  longestLived: boolean
}

export function familyLines(
  organisms: ReadonlyArray<{ alive: boolean; lineage_id?: string; surname?: string; age: number }>,
  lineageId: string,
  limit = 3,
): FamilyLine[] {
  const byName = new Map<string, { living: number; eldest: number }>()
  for (const o of organisms) {
    if (!o.alive || o.lineage_id !== lineageId || !o.surname) continue
    const f = byName.get(o.surname) ?? { living: 0, eldest: 0 }
    f.living += 1
    f.eldest = Math.max(f.eldest, o.age)
    byName.set(o.surname, f)
  }
  let oldest = -1
  for (const f of byName.values()) oldest = Math.max(oldest, f.eldest)
  const lines = [...byName.entries()].map(([surname, f]) => ({
    surname,
    living: f.living,
    eldestDays: Math.floor(f.eldest / DAY_TICKS),
    longestLived: f.eldest === oldest,
  }))
  lines.sort(
    (a, b) => b.living - a.living || b.eldestDays - a.eldestDays || a.surname.localeCompare(b.surname),
  )
  return lines.slice(0, limit)
}

/** One family as a card line: "Mira ×5, eldest 41 days (longest-lived)". */
export function familyLineText(f: FamilyLine): string {
  const tail = f.longestLived ? `, eldest ${f.eldestDays} days (longest-lived)` : ''
  return `${f.surname} ×${f.living}${tail}`
}
