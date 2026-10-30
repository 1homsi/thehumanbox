import { describe, expect, it } from 'vitest'
import {
  recordTribeSeries,
  SERIES_MAX,
  SERIES_SAMPLE_TICKS,
  seriesPoints,
  type TribeSeries,
} from './tribe-series'

// Only the fields the sampler reads; the rest of an organism is not needed here.
const org = (lineage_id: string, energy: number, health: number, alive = true) =>
  ({ lineage_id, energy, health, alive }) as never

describe('recordTribeSeries', () => {
  it('samples each tribe with living people once per interval, with its average food and health', () => {
    const series: TribeSeries = new Map()
    const state = { lastTick: -Infinity }
    const world = {
      tick: 0,
      organisms: [org('a', 0.2, 1), org('a', 0.6, 0.5), org('b', 0.9, 0.9, false)],
    }
    expect(recordTribeSeries(series, state, world)).toBe(true)
    expect(series.get('a')).toEqual([{ tick: 0, people: 2, food: 0.4, health: 0.75 }])
    expect(series.has('b')).toBe(false)

    // Not again until the interval has passed.
    expect(recordTribeSeries(series, state, { ...world, tick: SERIES_SAMPLE_TICKS - 1 })).toBe(false)
    expect(recordTribeSeries(series, state, { ...world, tick: SERIES_SAMPLE_TICKS })).toBe(true)
    expect(series.get('a')).toHaveLength(2)
  })

  it('a tribe that has died out keeps its samples, and the list stops at the newest ones', () => {
    const series: TribeSeries = new Map()
    const state = { lastTick: -Infinity }
    for (let i = 0; i < SERIES_MAX + 5; i++) {
      recordTribeSeries(series, state, {
        tick: i * SERIES_SAMPLE_TICKS,
        organisms: i < SERIES_MAX + 2 ? [org('gone', 0.5, 0.5)] : [],
      })
    }
    const kept = series.get('gone')!
    expect(kept).toHaveLength(SERIES_MAX)
    expect(kept[kept.length - 1]!.tick).toBe((SERIES_MAX + 1) * SERIES_SAMPLE_TICKS)
  })

  it('a new world (time went back) starts the series afresh', () => {
    const series: TribeSeries = new Map()
    const state = { lastTick: -Infinity }
    recordTribeSeries(series, state, { tick: 900, organisms: [org('a', 0.5, 0.5)] })
    recordTribeSeries(series, state, { tick: 10, organisms: [org('b', 0.5, 0.5)] })
    expect(series.has('a')).toBe(false)
    expect(series.get('b')?.[0]?.tick).toBe(10)
  })

  it('a save loaded between two samples still clears the old world, judged by the last tick seen', () => {
    const series: TribeSeries = new Map()
    const state = { lastTick: -Infinity }
    recordTribeSeries(series, state, { tick: 900, organisms: [org('a', 0.5, 0.5)] })
    // A frame that is too soon to sample, then a save from between them.
    expect(recordTribeSeries(series, state, { tick: 1190, organisms: [org('a', 0.5, 0.5)] })).toBe(false)
    recordTribeSeries(series, state, { tick: 1000, organisms: [org('b', 0.5, 0.5)] })
    expect(series.has('a')).toBe(false)
    expect(series.get('b')?.[0]?.tick).toBe(1000)
  })
})

describe('seriesPoints', () => {
  const at = (...pairs: [number, number][]) => pairs.map(([tick, value]) => ({ tick, value }))

  it('scales to the fixed range, so a steady value is a flat line', () => {
    expect(seriesPoints(at([0, 0.5], [300, 0.5]), 100, 20, 0, 1, 0, 300)).toBe('0.0,10.0 100.0,10.0')
    expect(seriesPoints(at([0, 0], [300, 1]), 100, 20, 0, 1, 0, 300)).toBe('0.0,19.0 100.0,1.0')
  })

  it('places each point by its tick, so uneven gaps between samples stay uneven', () => {
    // Samples at 0, 300 and 1200: the middle one sits a quarter of the way across, not half.
    expect(seriesPoints(at([0, 0], [300, 0], [1200, 0]), 100, 20, 0, 1, 0, 1200)).toBe(
      '0.0,19.0 25.0,19.0 100.0,19.0',
    )
  })

  it('draws nothing for fewer than two points', () => {
    expect(seriesPoints(at([0, 3]), 100, 20, 0, 5, 0, 0)).toBe('')
  })
})
