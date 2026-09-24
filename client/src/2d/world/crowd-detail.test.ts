import { expect, it } from 'vitest'
import { crowdLabelIds } from './crowd-detail'
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
