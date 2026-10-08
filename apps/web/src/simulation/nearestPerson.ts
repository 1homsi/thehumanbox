/** The living person nearest a point (in tiles) within `reach` tiles, or null. Ties keep the earlier person. */
export function nearestLivingPerson<T extends { alive: boolean; x: number; y: number }>(
  people: readonly T[],
  x: number,
  y: number,
  reach: number,
): T | null {
  let best: T | null = null
  let bestDistance = Infinity
  for (const person of people) {
    if (!person.alive) continue
    const distance = Math.hypot(person.x - x, person.y - y)
    if (distance <= reach && distance < bestDistance) {
      best = person
      bestDistance = distance
    }
  }
  return best
}
