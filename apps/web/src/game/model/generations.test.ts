import { describe, expect, it } from 'vitest'
import { generationLine, generationsOf, shownGeneration } from './generations'

describe('shownGeneration', () => {
  it('counts the founders as the first generation', () => {
    expect(shownGeneration(0)).toBe(1)
    expect(shownGeneration(3)).toBe(4)
  })
})

describe('generationLine', () => {
  it('names the oldest living generation and how many have been reached', () => {
    expect(generationLine({ lineage_id: 'a', oldest: 4, lived: 6 })).toBe(
      'oldest living generation 4 · 6 generations so far',
    )
  })

  it('leaves out the count when the oldest is the furthest reached', () => {
    expect(generationLine({ lineage_id: 'a', oldest: 2, lived: 2 })).toBe('oldest living generation 2')
  })
})

describe('generationsOf', () => {
  const rows = [{ lineage_id: 'lin-a', oldest: 3, lived: 3 }]

  it('finds a tribe that has reported its generations', () => {
    expect(generationsOf(rows, 'lin-a')?.oldest).toBe(3)
    expect(generationsOf(rows, 'lin-b')).toBeNull()
    expect(generationsOf(undefined, 'lin-a')).toBeNull()
  })
})
