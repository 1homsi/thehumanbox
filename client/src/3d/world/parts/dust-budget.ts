export const DUST_SCAN_BUDGET = 512
export const DUST_EMISSION_BUDGET = 12

/** Continue from the previous frame so crowded scenes do not favor array order. */
export function visitDustCandidates(count: number, start: number, emit: (index: number) => boolean): number {
  if (count === 0) return 0
  let cursor = start % count
  let emitted = 0
  for (let checked = 0; checked < Math.min(count, DUST_SCAN_BUDGET); checked++) {
    const index = cursor
    cursor = (cursor + 1) % count
    if (emit(index) && ++emitted >= DUST_EMISSION_BUDGET) break
  }
  return cursor
}

export function pruneDustEmitters(positions: Map<string, [number, number]>, livingIds: Set<string>) {
  for (const id of positions.keys()) if (!livingIds.has(id)) positions.delete(id)
}
