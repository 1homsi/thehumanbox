// Generations as people see them. The simulation stores a person's generation
// from 0 (the founders); people count from 1 (the founders are the first
// generation). See sim/agents/generations.rs.

export interface LineageGenerations {
  lineage_id: string
  /** The generation of the oldest living member, counted from 1. */
  oldest: number
  /** The number of generations the tribe has reached, counted from 1. */
  lived: number
}

/** The generation a person is shown as, from the stored generation. */
export function shownGeneration(stored: number): number {
  return stored + 1
}

/** The generation facts for one tribe, if the simulation reported it. */
export function generationsOf(
  rows: LineageGenerations[] | undefined,
  lineage: string,
): LineageGenerations | null {
  return rows?.find((r) => r.lineage_id === lineage) ?? null
}

/** "generation 4 (6 generations so far)", for a tribe card. */
export function generationLine(g: LineageGenerations): string {
  const oldest = `oldest living generation ${g.oldest}`
  return g.lived > g.oldest ? `${oldest} · ${g.lived} generations so far` : oldest
}
