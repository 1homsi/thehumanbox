import { describe, expect, it } from 'vitest'
import { crimeLineOf } from './crime'

describe('crimeLineOf', () => {
  const rows = [
    { lineage_id: 'a', thefts: 1, murders: 0, punished: 1 },
    { lineage_id: 'b', thefts: 3, murders: 2, punished: 0 },
    { lineage_id: 'c', thefts: 0, murders: 0, punished: 0 },
  ]

  it('says nothing for a tribe with no crime', () => {
    expect(crimeLineOf(rows, 'c')).toBeNull()
    expect(crimeLineOf(rows, 'missing')).toBeNull()
    expect(crimeLineOf(undefined, 'a')).toBeNull()
  })

  it('counts thefts in the singular and plural', () => {
    expect(crimeLineOf(rows, 'a')).toBe('1 theft')
  })

  it('adds the killings when a tribe has any', () => {
    expect(crimeLineOf(rows, 'b')).toBe('3 thefts, 2 killings')
    expect(crimeLineOf([{ lineage_id: 'x', thefts: 2, murders: 1, punished: 0 }], 'x')).toBe(
      '2 thefts, 1 killing',
    )
  })
})
