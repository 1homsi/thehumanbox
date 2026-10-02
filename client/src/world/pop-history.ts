import type { WorldState } from '../types'

/** Ticks between samples, and how many a tribe keeps. */
export const SAMPLE_TICKS = 300
export const MAX_SAMPLES = 48

/** Each tribe's headcount over the last few seasons, oldest first. */
export type PopHistory = Map<string, number[]>

/**
 * Record a sample of every tribe's headcount, at most once per sample
 * interval. A tribe with no one alive keeps its last samples out of the list.
 * Rewinding time (a loaded save) starts the history afresh.
 */
export function recordPopulations(
  history: PopHistory,
  state: { lastTick: number },
  world: Pick<WorldState, 'tick' | 'organisms'>,
): boolean {
  if (world.tick < state.lastTick) {
    history.clear()
    state.lastTick = -Infinity
  }
  if (world.tick - state.lastTick < SAMPLE_TICKS) return false
  state.lastTick = world.tick
  const counts = new Map<string, number>()
  for (const o of world.organisms) {
    if (o.alive === false || !o.lineage_id) continue
    counts.set(o.lineage_id, (counts.get(o.lineage_id) ?? 0) + 1)
  }
  for (const [lineage, n] of counts) {
    const samples = history.get(lineage) ?? []
    samples.push(n)
    if (samples.length > MAX_SAMPLES) samples.shift()
    history.set(lineage, samples)
  }
  for (const lineage of [...history.keys()]) if (!counts.has(lineage)) history.delete(lineage)
  return true
}

/** Points for an SVG polyline in a w×h box, scaled to the history's own range. */
export function sparklinePoints(samples: readonly number[], w: number, h: number): string {
  if (samples.length < 2) return ''
  const lo = Math.min(...samples)
  const hi = Math.max(...samples)
  const span = Math.max(1, hi - lo)
  return samples
    .map(
      (n, i) =>
        `${((i / (samples.length - 1)) * w).toFixed(1)},${(h - ((n - lo) / span) * (h - 2) - 1).toFixed(1)}`,
    )
    .join(' ')
}

/** Whether a tribe is growing, shrinking or steady, over its history. */
export function trend(samples: readonly number[]): 'up' | 'down' | 'flat' {
  if (samples.length < 3) return 'flat'
  const first = samples[0]!
  const last = samples[samples.length - 1]!
  const margin = Math.max(1, first * 0.08)
  return last > first + margin ? 'up' : last < first - margin ? 'down' : 'flat'
}
