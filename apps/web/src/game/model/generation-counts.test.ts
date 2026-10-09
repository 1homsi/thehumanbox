import { describe, expect, it } from 'vitest'
import { generationCounts } from './generation-counts'

const p = (generation: number, alive = true) => ({ alive, generation })

describe('generationCounts', () => {
  it('counts the living in each generation, oldest first', () => {
    expect(generationCounts([p(2), p(0), p(2), p(1), p(0, false)])).toEqual([
      { generation: 0, living: 1 },
      { generation: 1, living: 1 },
      { generation: 2, living: 2 },
    ])
  })

  it('is empty when nobody is alive', () => {
    expect(generationCounts([p(3, false)])).toEqual([])
  })
})
