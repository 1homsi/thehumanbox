import type { WorldState } from '../../shared/types'

/** Ticks between samples, and how many a tribe keeps (the oldest go first). */
export const SERIES_SAMPLE_TICKS = 300
export const SERIES_MAX = 96

/** One sample of a tribe: its headcount, and its average food and health over its living people (0..1). */
export interface SeriesSample {
  tick: number
  people: number
  food: number
  health: number
}

/** Each tribe's samples over time, oldest first, keyed by lineage id. */
export type TribeSeries = Map<string, SeriesSample[]>

/**
 * Record a sample for every tribe with living people, at most once per sample interval. Unlike the headcount
 * history, a tribe that has died out keeps its samples, so its trend stays readable. Rewinding time (a loaded
 * save) starts the series afresh. Returns whether a sample was taken.
 */
export function recordTribeSeries(
  series: TribeSeries,
  state: { lastTick: number },
  world: Pick<WorldState, 'tick' | 'organisms'>,
): boolean {
  if (world.tick < state.lastTick) {
    series.clear()
    state.lastTick = -Infinity
  }
  if (world.tick - state.lastTick < SERIES_SAMPLE_TICKS) return false
  state.lastTick = world.tick
  const totals = new Map<string, { people: number; energy: number; health: number }>()
  for (const o of world.organisms) {
    if (o.alive === false || !o.lineage_id) continue
    const t = totals.get(o.lineage_id) ?? { people: 0, energy: 0, health: 0 }
    t.people += 1
    t.energy += o.energy
    t.health += o.health
    totals.set(o.lineage_id, t)
  }
  for (const [lineage, t] of totals) {
    const samples = series.get(lineage) ?? []
    samples.push({
      tick: world.tick,
      people: t.people,
      food: clamp01(t.energy / t.people),
      health: clamp01(t.health / t.people),
    })
    if (samples.length > SERIES_MAX) samples.shift()
    series.set(lineage, samples)
  }
  return true
}

/**
 * Points for an SVG polyline in a w×h box. The values are scaled to a fixed range `[lo, hi]`, so two tribes'
 * charts read on the same scale and a flat line means a steady number.
 */
export function seriesPoints(
  values: readonly number[],
  w: number,
  h: number,
  lo: number,
  hi: number,
): string {
  if (values.length < 2) return ''
  const span = Math.max(1e-9, hi - lo)
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w
      const y = h - ((Math.max(lo, Math.min(hi, v)) - lo) / span) * (h - 2) - 1
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}
