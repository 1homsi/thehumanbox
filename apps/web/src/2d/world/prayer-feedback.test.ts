import { beforeEach, describe, expect, it } from 'vitest'
import {
  activePrayerEffects,
  celebrating,
  resetPrayerFeedback,
  updatePrayerFeedback,
} from './prayer-feedback'

const prayer = (id: number, lineage_id: string) => ({
  id,
  lineage_id,
  tribe: lineage_id,
  kind: 'hunger',
  x: id * 10,
  y: 5,
  created: 0,
  expires: 1800,
})
const faith = (blessed: string[], despairing: string[]) => ({
  by_lineage: {},
  answered: 0,
  forsaken: 0,
  blessed,
  despairing,
})

describe('prayer feedback', () => {
  beforeEach(() => resetPrayerFeedback())

  it('celebrates an answered prayer and sighs at a forsaken one', () => {
    updatePrayerFeedback([prayer(1, 'a'), prayer(2, 'b'), prayer(3, 'c')], faith([], []), 0)
    expect(activePrayerEffects()).toHaveLength(0)
    updatePrayerFeedback([prayer(3, 'c')], faith(['a'], ['b']), 100)
    const effects = activePrayerEffects()
    expect(effects.map((e) => [e.x, e.answered])).toEqual([
      [10, true],
      [20, false],
    ])
  })

  it('lets effects fade out', () => {
    updatePrayerFeedback([prayer(1, 'a')], faith([], []), 0)
    updatePrayerFeedback([], faith(['a'], []), 100)
    updatePrayerFeedback([], faith(['a'], []), 6000)
    expect(activePrayerEffects()).toHaveLength(0)
  })

  it('has the answered tribe celebrate nearby for a few seconds', () => {
    updatePrayerFeedback([prayer(1, 'a')], faith([], []), 0)
    updatePrayerFeedback([], faith(['a'], []), 100)
    expect(celebrating('a', 12, 7, 2000)).toBe(true)
    expect(celebrating('b', 12, 7, 2000)).toBe(false)
    expect(celebrating('a', 60, 7, 2000)).toBe(false)
    expect(celebrating('a', 12, 7, 9000)).toBe(false)
  })
})
