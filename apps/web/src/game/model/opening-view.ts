/** The least a person needs for the opening view: where they stand, whether they live, and their tribe. */
export interface PlacedPerson {
  x: number
  y: number
  alive: boolean
  lineage_id: string
}

/**
 * Where the camera first looks: at the biggest tribe, so a new player sees people and their huts at a
 * size they can read instead of a whole island of specks. The spot is one of that tribe's own people,
 * the one nearest the tribe's middle, so a tribe spread over two shores is not centred on the sea
 * between them. Null when nobody is alive.
 */
export function openingSpot(people: readonly PlacedPerson[]): { x: number; y: number } | null {
  const tribes = new Map<string, PlacedPerson[]>()
  for (const person of people) {
    if (!person.alive) continue
    const members = tribes.get(person.lineage_id)
    if (members) members.push(person)
    else tribes.set(person.lineage_id, [person])
  }
  let biggest: PlacedPerson[] | null = null
  for (const [id, members] of tribes) {
    // Ties go to the tribe whose id sorts first, so the same world opens on the same tribe.
    if (
      !biggest ||
      members.length > biggest.length ||
      (members.length === biggest.length && id < biggest[0].lineage_id)
    ) {
      biggest = members
    }
  }
  if (!biggest) return null
  const mx = biggest.reduce((sum, p) => sum + p.x, 0) / biggest.length
  const my = biggest.reduce((sum, p) => sum + p.y, 0) / biggest.length
  let nearest = biggest[0]
  let best = Infinity
  for (const p of biggest) {
    const d = (p.x - mx) ** 2 + (p.y - my) ** 2
    if (d < best) {
      best = d
      nearest = p
    }
  }
  return { x: nearest.x, y: nearest.y }
}

let openingViewUsed = false

/**
 * True the first time it is asked in a page load, false after: the opening view is shown once, not
 * each time the map remounts (coming back out of a home does that).
 */
export function claimOpeningView(): boolean {
  if (openingViewUsed) return false
  openingViewUsed = true
  return true
}

/** For tests: the next map to open shows the opening view again. */
export function resetOpeningView(): void {
  openingViewUsed = false
}
