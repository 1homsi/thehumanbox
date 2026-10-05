import { describe, expect, it } from 'vitest'
import { atmosphereOverlays, groundTint } from './atmosphere-tint'

const channels = (c: number) => [(c >>> 24) & 255, (c >>> 16) & 255, (c >>> 8) & 255, c & 255]

describe('ground tint', () => {
  it('leaves the ground untouched in full daylight', () => {
    expect(atmosphereOverlays({ is_day: true, day_progress: 0.3 })).toEqual([])
    expect(groundTint({ is_day: true, day_progress: 0.3 })).toBe(0xffffffff)
  })

  it('darkens and blues the ground at night', () => {
    const [r, , b, a] = channels(groundTint({ is_day: false, day_progress: 0.85 }))
    expect(a).toBe(255)
    expect(r).toBeLessThan(220)
    expect(b).toBeGreaterThan(r)
    expect(r).toBeGreaterThan(100)
  })

  it('never brightens: warm dusk light multiplies to at most white', () => {
    for (const dp of [0.02, 0.1, 0.56, 0.7]) {
      const [r, g, b] = channels(groundTint({ is_day: true, day_progress: dp }))
      expect(Math.max(r, g, b)).toBeLessThanOrEqual(255)
      expect(Math.min(r, g, b)).toBeGreaterThan(150)
    }
  })

  it('changes in steps, so the layers are not rewritten every frame', () => {
    const tints = new Set<number>()
    for (let i = 0; i < 200; i++) tints.add(groundTint({ is_day: false, day_progress: 0.6 + i * 0.0015 }))
    expect(tints.size).toBeLessThan(40)
  })
})
