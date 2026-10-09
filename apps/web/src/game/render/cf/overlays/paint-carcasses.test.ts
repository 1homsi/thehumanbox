import { describe, expect, it } from 'vitest'
import { PICKED_CLEAN, carcassPixels, carcassWidth } from './paint-carcasses'

const reach = (pixels: [number, number, number, number, string][]) =>
  Math.max(...pixels.map(([x, , w]) => x + w)) - Math.min(...pixels.map(([x]) => x))

describe('carcass remains', () => {
  it('are bigger for big prey', () => {
    expect(carcassWidth('rabbit')).toBeLessThan(carcassWidth('deer'))
    expect(carcassWidth('wolf')).toBe(6)
  })

  it('shrink as birds pick them over, and stay visible until the last bird-tick', () => {
    const fresh = reach(carcassPixels('deer', 0, 10, 50, 50))
    const half = reach(carcassPixels('deer', PICKED_CLEAN / 2, 10, 50, 50))
    const picked = reach(carcassPixels('deer', PICKED_CLEAN, 10, 50, 50))
    expect(fresh).toBeGreaterThan(half)
    expect(half).toBeGreaterThan(picked)
    expect(picked).toBeGreaterThanOrEqual(2)
  })

  it('go grey as they age', () => {
    expect(carcassPixels('deer', 0, 10, 0, 0).map((p) => p[4])).toContain('#8a2c22')
    expect(carcassPixels('deer', 0, 300, 0, 0).map((p) => p[4])).toContain('#7a5a48')
  })
})
