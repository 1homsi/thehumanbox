import { describe, expect, it } from 'vitest'
import { STRIKE_SLOT_MS, boltPath, strikeAt, strikeEnvelope, unitHash } from './weather-fx'

const VIEW = { cx: 500, cy: 400, hw: 300, hh: 200 }

describe('lightning', () => {
  it('flashes at full strength right after a strike and is dark long after', () => {
    expect(strikeEnvelope(0)).toBe(1)
    expect(strikeEnvelope(30)).toBe(1)
    expect(strikeEnvelope(-1)).toBe(0)
    expect(strikeEnvelope(10_000)).toBe(0)
  })

  it('is deterministic and strikes inside the camera view', () => {
    let found = 0
    for (let t = 0; t < STRIKE_SLOT_MS * 40; t += 50) {
      const a = strikeAt(t, 1, VIEW)
      expect(strikeAt(t, 1, VIEW)).toEqual(a)
      if (a) {
        found++
        expect(Math.abs(a.x - VIEW.cx)).toBeLessThanOrEqual(VIEW.hw * 0.8 + 1e-9)
        expect(Math.abs(a.y - VIEW.cy)).toBeLessThanOrEqual(VIEW.hh * 0.7 + 1e-9)
      }
    }
    expect(found).toBeGreaterThan(0)
  })

  it('a stronger storm strikes more often', () => {
    const count = (intensity: number) => {
      let n = 0
      for (let t = 0; t < STRIKE_SLOT_MS * 200; t += 40) if (strikeAt(t, intensity, VIEW)) n++
      return n
    }
    expect(count(1)).toBeGreaterThan(count(0))
  })

  it('bolts run from the top of the view to the strike point', () => {
    const pts = boltPath(7, 100, 300, 50)
    expect(pts).toHaveLength(18)
    expect([pts[0], pts[1]]).toEqual([100, 50])
    expect([pts[16], pts[17]]).toEqual([100, 300])
  })
})

describe('unitHash', () => {
  it('stays in [0, 1) and is stable', () => {
    for (let i = 0; i < 200; i++) {
      const v = unitHash(i, i * 3)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
      expect(unitHash(i, i * 3)).toBe(v)
    }
  })
})
