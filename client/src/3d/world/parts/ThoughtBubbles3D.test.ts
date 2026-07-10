import { describe, expect, it } from 'vitest'
import { displayThought } from './thought-bubbles'

describe('displayThought', () => {
  it('normalizes simulation phrases for world-space bubbles', () => {
    expect(displayThought('  sharing_a_meal   with kin ')).toBe('sharing a meal with kin')
  })

  it('suppresses empty and generic idle states', () => {
    expect(displayThought('idle')).toBeNull()
    expect(displayThought('   ')).toBeNull()
  })

  it('bounds long thoughts so they cannot dominate the scene', () => {
    const result = displayThought(
      'telling a very long story about the settlement and everyone who lives there',
    )
    expect(result).toHaveLength(42)
    expect(result?.endsWith('...')).toBe(true)
  })
})
