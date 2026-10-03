import { describe, expect, it } from 'vitest'
import { festivalGlow, festivalLabel } from './festivals'

const f = { name: 'Harvest Feast', lineage_id: 'a', started: 1000, ends: 1900 }

describe('festivals on the map', () => {
  it('light quickly, burn bright, and fade as they end', () => {
    expect(festivalGlow(f, 1000)).toBe(0)
    expect(festivalGlow(f, 1090)).toBeCloseTo(1)
    expect(festivalGlow(f, 1450)).toBeGreaterThan(festivalGlow(f, 1850))
    expect(festivalGlow(f, 1900)).toBeGreaterThan(0)
  })

  it('names a tribe festival for its card', () => {
    expect(festivalLabel([f], 'a')).toBe('Harvest Feast')
    expect(festivalLabel([f], 'b')).toBeNull()
    expect(festivalLabel(undefined, 'a')).toBeNull()
  })
})
