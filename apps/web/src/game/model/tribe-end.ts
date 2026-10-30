import type { TribeChronicleRow, WorldState } from '../../shared/types'
import { t } from '../../i18n'
import { historyRows } from './tribe-history'
import { LOSS_WORDS } from './tribe-peril'

/** How many of a fallen tribe's latest events its end summary shows. */
export const END_SHOWN = 6
/** How many lines a fallen tribe's full history shows: the sim keeps this many entries for each tribe. */
export const FALLEN_HISTORY_SHOWN = 40

/** A tribe that has died out, as its history says. */
export interface FallenTribe {
  lineage: string
  /** The tick it died out. */
  tick: number
  /** Where its last member died, in tiles; null when the sim recorded no place. */
  place: [number, number] | null
  /** The death cause the sim recorded for its last member (e.g. `starvation`), or null. */
  cause: string | null
}

/** The extinction line of a tribe's history (the latest one), or null when it has none. */
export function extinctionOf(rows: readonly TribeChronicleRow[] | undefined): TribeChronicleRow | null {
  let last: TribeChronicleRow | null = null
  for (const row of rows ?? []) {
    if (row.kind === 'extinct' && (last === null || row.tick >= last.tick)) last = row
  }
  return last
}

function placeOfRow(row: TribeChronicleRow): [number, number] | null {
  return row.x !== null && row.y !== null ? [row.x, row.y] : null
}

/** Tribes whose last member has died and that have no one alive now, newest first. */
export function fallenTribes(world: Pick<WorldState, 'tribe_chronicle' | 'organisms'>): FallenTribe[] {
  const living = new Set(world.organisms.filter((o) => o.alive !== false).map((o) => o.lineage_id))
  const fallen: FallenTribe[] = []
  for (const [lineage, rows] of Object.entries(world.tribe_chronicle ?? {})) {
    if (living.has(lineage)) continue
    const end = extinctionOf(rows)
    if (!end) continue
    fallen.push({ lineage, tick: end.tick, place: placeOfRow(end), cause: end.word })
  }
  return fallen.sort((a, b) => b.tick - a.tick)
}

/** A recorded death cause in plain words ("hunger", "old age"), or the raw cause for one not in the list. */
export function causeText(cause: string): string {
  const key = LOSS_WORDS[cause]
  return key ? t(key) : cause.replace(/_/g, ' ')
}

/** One line of an end summary. Only the extinction line is a cause the sim recorded; the rest are context. */
export interface EndLine {
  row: TribeChronicleRow
  causal: boolean
}

/** A fallen tribe's last events, newest first. */
export function endSummary(rows: readonly TribeChronicleRow[] | undefined, limit = END_SHOWN): EndLine[] {
  return historyRows(rows, limit).map((row) => ({ row, causal: row.kind === 'extinct' && row.word !== null }))
}
