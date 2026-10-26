import type { TribeChronicleRow } from '../../shared/types'

/** How many of a tribe's latest lines its card shows. */
export const HISTORY_SHOWN = 12

/** The lines a tribe's card shows: its newest `limit` entries, newest first. */
export function historyRows(
  entries: readonly TribeChronicleRow[] | undefined,
  limit = HISTORY_SHOWN,
): TribeChronicleRow[] {
  return [...(entries ?? [])].sort((a, b) => b.tick - a.tick).slice(0, limit)
}

/** The tile a line happened at, or null when the sim recorded no place for it. */
export function placeOf(row: TribeChronicleRow): [number, number] | null {
  return row.x !== null && row.y !== null ? [row.x, row.y] : null
}
