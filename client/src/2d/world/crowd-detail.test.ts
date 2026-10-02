import { describe, expect, it } from 'vitest'
import { crowdLabelIds, LabelPlacer, labelWidth } from './crowd-detail'
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
