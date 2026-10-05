import { describe, expect, it } from 'vitest'
import { diffImage, diffStats } from './diff'

const px = (...rgba: number[]) => new Uint8ClampedArray(rgba)

describe('pixel diff', () => {
  it('reports zero for equal images', () => {
    const a = px(10, 20, 30, 255, 1, 2, 3, 255)
    const d = diffStats(a, a, [10, 20, 30])
    expect(d.meanAbs).toBe(0)
    expect(d.over8).toBe(0)
    expect(d.covered).toBe(1)
  })

  it('counts pixels over each threshold by their worst channel', () => {
    const a = px(0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255)
    const b = px(0, 0, 0, 255, 9, 0, 0, 255, 0, 30, 0, 255, 0, 0, 100, 255)
    const d = diffStats(a, b, [0, 0, 0])
    expect(d.over8).toBeCloseTo(3 / 4)
    expect(d.over24).toBeCloseTo(2 / 4)
    expect(d.over64).toBeCloseTo(1 / 4)
    expect(d.meanAbs).toBeCloseTo((0 + 3 + 10 + 33.333333) / 4, 3)
  })

  it('measures the layers only where one image left the ground colour', () => {
    const ground: [number, number, number] = [5, 5, 5]
    const a = px(5, 5, 5, 255, 50, 50, 50, 255)
    const b = px(5, 5, 5, 255, 70, 50, 50, 255)
    const d = diffStats(a, b, ground)
    expect(d.covered).toBe(1)
    expect(d.coveredMeanAbs).toBeCloseTo(20 / 3, 5)
    expect(d.meanAbs).toBeCloseTo(20 / 3 / 2, 5)
  })

  it('draws red where the first is brighter and blue where the second is', () => {
    const out = new Uint8ClampedArray(8)
    diffImage(px(100, 100, 100, 255, 0, 0, 0, 255), px(0, 0, 0, 255, 100, 100, 100, 255), out)
    expect(out[0]).toBeGreaterThan(out[2])
    expect(out[6]).toBeGreaterThan(out[4])
  })
})
