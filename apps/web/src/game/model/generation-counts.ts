// How many living people belong to each generation (generation 0 is the first
// people of the world, each child is one generation on from its parents).

export interface GenerationCount {
  generation: number
  living: number
}

/** The living count per generation, oldest generation first. */
export function generationCounts(
  organisms: ReadonlyArray<{ alive: boolean; generation: number }>,
): GenerationCount[] {
  const byGen = new Map<number, number>()
  for (const o of organisms) {
    if (!o.alive) continue
    byGen.set(o.generation, (byGen.get(o.generation) ?? 0) + 1)
  }
  return [...byGen.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([generation, living]) => ({ generation, living }))
}
