import { describe, expect, it } from 'vitest'
import { skillPercent, skillWord } from './skills'

describe('skillWord', () => {
  it('ranks practice from apprentice to master', () => {
    expect(skillWord(0)).toBe('apprentice')
    expect(skillWord(0.3)).toBe('journeyman')
    expect(skillWord(0.7)).toBe('skilled')
    expect(skillWord(0.95)).toBe('master')
  })
})

describe('skillPercent', () => {
  it('reads practice as a percentage and keeps it in range', () => {
    expect(skillPercent(0.37)).toBe('37%')
    expect(skillPercent(1.4)).toBe('100%')
    expect(skillPercent(-0.2)).toBe('0%')
  })
})
