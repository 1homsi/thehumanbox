import { describe, expect, it } from 'vitest'
import { SANDBOX_CATEGORIES } from '../simulation/sandbox'
import { mergePrayerBubbles } from '../2d/world/prayer-bubbles'
import {
  PRAYER_KINDS,
  prayerPlea,
  prayerRows,
  prayerRowText,
  prayerTimeLeft,
  prayerTool,
  sortPrayers,
} from './prayers'

const base = { lineage_id: 'L1', tribe: 'Ashari', x: 10, y: 12, created: 1000, expires: 2800 }

describe('prayers', () => {
  it('maps every prayer kind to a dock tool that exists', () => {
    const ids = new Set(SANDBOX_CATEGORIES.flatMap((c) => c.tools).map((t) => t.id))
    for (const kind of Object.keys(PRAYER_KINDS)) expect(ids.has(prayerTool(kind)!), kind).toBe(true)
    expect(prayerTool('nonsense')).toBeNull()
  })

  it('reads as a plea and tracks the time left', () => {
    expect(prayerPlea({ kind: 'hunger', tribe: 'Ashari' })).toBe('Ashari pray for food')
    expect(prayerPlea({ kind: 'rain', tribe: '' })).toBe('A tribe pray for rain')
    expect(prayerTimeLeft(base, 1000)).toBe(1)
    expect(prayerTimeLeft(base, 1900)).toBeCloseTo(0.5)
    expect(prayerTimeLeft(base, 5000)).toBe(0)
  })

  it('lists the prayer closest to lapsing first', () => {
    const sorted = sortPrayers(
      [
        { ...base, id: 1, kind: 'hunger' },
        { ...base, id: 2, kind: 'thirst', created: 500, expires: 2300 },
      ],
      2000,
    )
    expect(sorted.map((p) => p.id)).toEqual([2, 1])
  })

  it('lists world-wide prayers once, however many tribes ask', () => {
    const rows = prayerRows(
      [
        { ...base, id: 1, kind: 'rain', tribe: 'A' },
        { ...base, id: 2, kind: 'hunger', tribe: 'B' },
        { ...base, id: 3, kind: 'rain', tribe: 'C' },
      ],
      1500,
    )
    expect(rows.map(prayerRowText)).toEqual(['2 tribes pray for rain', 'B pray for food'])
  })

  it('merges bubbles that would overlap, most urgent first', () => {
    const merged = mergePrayerBubbles(
      [
        { prayer: 'a', x: 0, y: 0, left: 0.9 },
        { prayer: 'b', x: 5, y: 4, left: 0.2 },
        { prayer: 'c', x: 80, y: 0, left: 0.5 },
      ],
      16,
    )
    expect(merged.map((m) => [m.prayer, m.count])).toEqual([
      ['b', 2],
      ['c', 1],
    ])
  })
})
