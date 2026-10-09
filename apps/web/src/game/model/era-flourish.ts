import type { WorldState } from '../../shared/types'

/** World ticks an era change stays marked on the map. */
export const FLOURISH_TICKS = 300

/** A tribe that moved on to a new era, and the world tick it happened at. */
export interface EraChange {
  lineage: string
  /** The era it entered, pretty-printed (`pre stone`, `bronze`, ...). */
  era: string
  tick: number
}

/** Each tribe's era as `[lineage id, era name]`, from either wire form. */
export function eraRows(world: Pick<WorldState, 'lineage_eras'>): [string, string][] {
  const eras = world.lineage_eras
  if (!eras) return []
  const pretty = (raw: string) => raw.replace(/[-_]/g, ' ')
  if (Array.isArray(eras))
    return eras.filter((r) => r.era_name).map((r) => [r.lineage_id, pretty(r.era_name)])
  return Object.entries(eras).map(([id, raw]) => [id, pretty(raw)])
}

/**
 * Notices when a tribe enters a new era between two frames of the same world, so the map can mark it.
 * An era never goes back, so any change of name is an advance. A tribe seen for the first time (a
 * world just loaded) is not an advance, and neither is anything in the frames before a reload.
 */
export class EraWatch {
  private eras = new Map<string, string>()
  private changes: EraChange[] = []
  private lastTick = -Infinity

  /** Reads one frame of the world; returns the advances it shows. Safe to call on every frame. */
  update(world: Pick<WorldState, 'lineage_eras' | 'tick'>): EraChange[] {
    if (world.tick < this.lastTick) {
      this.eras.clear()
      this.changes = []
    }
    this.lastTick = world.tick
    const found: EraChange[] = []
    for (const [lineage, era] of eraRows(world)) {
      const before = this.eras.get(lineage)
      if (before !== undefined && before !== era) found.push({ lineage, era, tick: world.tick })
      this.eras.set(lineage, era)
    }
    this.changes = [...this.changes, ...found].filter((c) => world.tick - c.tick < FLOURISH_TICKS)
    return found
  }

  /** The advances still within their marking time at `tick`. */
  active(tick: number): EraChange[] {
    return this.changes.filter((c) => tick >= c.tick && tick - c.tick < FLOURISH_TICKS)
  }
}
