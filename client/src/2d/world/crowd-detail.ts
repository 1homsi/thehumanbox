/** Bound unreadable overlapping labels while retaining every person's sprite. */
export function crowdLabelIds(
  people: readonly { id: string; x: number; y: number }[],
  zoom: number,
): Set<string> | null {
  if (people.length <= 400) return null
  const cells = new Map<string, string>()
  const scale = Math.max(0.1, zoom) * 8
  for (const person of people) {
    const key = `${Math.floor((person.x * scale) / 80)},${Math.floor((person.y * scale) / 22)}`
    const previous = cells.get(key)
    if (previous === undefined || person.id < previous) cells.set(key, person.id)
  }
  return new Set(cells.values())
}
