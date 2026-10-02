import { describe, expect, it } from 'vitest'
import {
  MAX_SAMPLES,
  recordPopulations,
  sparklinePoints,
  SAMPLE_TICKS,
  trend,
  type PopHistory,
} from './pop-history'

const world = (tick: number, counts: Record<string, number>) =>
  ({
    tick,
    organisms: Object.entries(counts).flatMap(([lineage_id, n]) =>
      Array.from({ length: n }, () => ({ lineage_id, alive: true })),
    ),
  }) as never

describe('population history', () => {
  it('samples once per interval and forgets tribes that are gone', () => {
    const h: PopHistory = new Map()
    const state = { lastTick: -Infinity }
    expect(recordPopulations(h, state, world(0, { a: 5, b: 3 }))).toBe(true)
    expect(recordPopulations(h, state, world(SAMPLE_TICKS - 1, { a: 6, b: 3 }))).toBe(false)
    expect(recordPopulations(h, state, world(SAMPLE_TICKS, { a: 6 }))).toBe(true)
    expect(h.get('a')).toEqual([5, 6])
    expect(h.has('b')).toBe(false)
  })

  it('keeps a bounded window and restarts when time rewinds', () => {
    const h: PopHistory = new Map()
    const state = { lastTick: -Infinity }
    for (let i = 0; i < MAX_SAMPLES + 10; i++) recordPopulations(h, state, world(i * SAMPLE_TICKS, { a: i }))
    expect(h.get('a')).toHaveLength(MAX_SAMPLES)
    recordPopulations(h, state, world(0, { a: 1 }))
    expect(h.get('a')).toEqual([1])
  })

  it('draws a line scaled to its own range', () => {
    expect(sparklinePoints([4], 40, 10)).toBe('')
    const pts = sparklinePoints([2, 4, 6], 40, 10).split(' ')
    expect(pts).toHaveLength(3)
    expect(pts[0]).toBe('0.0,9.0')
    expect(pts[2]).toBe('40.0,1.0')
  })

  it('reads the trend', () => {
    expect(trend([50, 48, 30])).toBe('down')
    expect(trend([20, 25, 40])).toBe('up')
    expect(trend([30, 31, 30])).toBe('flat')
    expect(trend([5, 9])).toBe('flat')
  })
})
