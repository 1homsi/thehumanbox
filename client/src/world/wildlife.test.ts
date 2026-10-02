import { describe, expect, it } from 'vitest'
import { wildlifeCounts } from './wildlife'

describe('wildlife', () => {
  it('counts animals by kind, groups herds, and leaves out empty kinds', () => {
    const animals = [
      { kind: 'deer' },
      { kind: 'deer' },
      { kind: 'sheep' },
      { kind: 'cow' },
      { kind: 'wolf' },
    ] as never
    expect(wildlifeCounts(animals)).toEqual([
      { label: 'deer', count: 2 },
      { label: 'herds', count: 2 },
      { label: 'wolves', count: 1, danger: true },
    ])
  })

  it('shows birds flown south for the winter separately', () => {
    const birds = [{ kind: 'bird' }, { kind: 'bird', away: true }, { kind: 'bird', away: true }] as never
    expect(wildlifeCounts(birds)).toEqual([{ label: 'birds', count: 1, away: 2 }])
  })

  it('copes with no animals', () => {
    expect(wildlifeCounts(undefined)).toEqual([])
  })
})
