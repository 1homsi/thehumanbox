import { describe, expect, it } from 'vitest'
import { crowdLabelIds, crowdLabelWinners, LabelPlacer, labelWidth } from './crowd-detail'
it('keeps ordinary crowds unchanged', () => {
  expect(crowdLabelIds([{ id: 'a', x: 1, y: 1 }], 2)).toBeNull()
})
it('bounds dense labels by screen space and keeps selection stable across draw order', () => {
  const people = Array.from({ length: 5000 }, (_, i) => ({ id: `p-${i}`, x: i % 10, y: i % 3 }))
  const labels = crowdLabelIds(people, 2)!
  expect(labels.size).toBeLessThanOrEqual(6)
  expect(labels).toEqual(crowdLabelIds([...people].reverse(), 2))
  expect(people).toHaveLength(5000)
  expect(crowdLabelIds(people, 8)!.size).toBeGreaterThan(labels.size)
})

describe('crowd label winners', () => {
  it('marks exactly the people whose ids the Set version keeps, for any slot order and zoom', () => {
    let seed = 99
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }
    for (const [zoom, spread] of [
      [0.5, 300],
      [2, 300],
      [8, 300],
      [2, 1e7],
    ] as const) {
      for (const n of [10, 401, 3000]) {
        const people = Array.from({ length: n }, (_, i) => ({
          id: `p${Math.floor(rand() * 1e6)}-${i}`,
          x: rand() * spread,
          y: rand() * spread,
        }))
        const slots = Int32Array.from({ length: n }, (_, i) => n - 1 - i) // visit in reverse slot order
        const out = new Uint8Array(n).fill(7)
        const thinned = crowdLabelWinners(people, slots, n, zoom, out)
        const labels = crowdLabelIds(people, zoom)
        expect(thinned).toBe(labels !== null)
        if (labels === null) continue
        people.forEach((p, j) => expect(out[j]).toBe(labels.has(p.id) ? 1 : 0))
      }
    }
  })
})

describe('label placer', () => {
  it('skips labels that would overlap and always keeps forced ones', () => {
    const placer = new LabelPlacer()
    expect(placer.place(100, 100, 40, 10)).toBe(true)
    expect(placer.place(110, 104, 40, 10)).toBe(false)
    expect(placer.place(100, 120, 40, 10)).toBe(true)
    expect(placer.place(150, 100, 40, 10)).toBe(true)
    expect(placer.place(105, 100, 40, 10, true)).toBe(true)
  })

  it('estimates monospace label widths', () => {
    expect(labelWidth('Ashari', 10)).toBeCloseTo(40)
  })
})
