import { describe, expect, it } from 'vitest'
import { workActivity } from './activity-visuals'

describe('visible work actions', () => {
  it('shows current labor and rest', () => {
    expect(workActivity('repairing our House', false)).toBe('build')
    expect(workActivity('reclaiming an abandoned Hut', false)).toBe('build')
    expect(workActivity('gathering wood', false)).toBe('chop')
    expect(workActivity('harvesting', false)).toBe('farm')
    expect(workActivity('fishing', false)).toBe('fish')
    expect(workActivity('caught a fish', false)).toBe('fish')
    expect(workActivity('felling trees', false)).toBe('chop')
    expect(workActivity('stalking game', false)).toBe('hunt')
    expect(workActivity('checking the traps', false)).toBe('hunt')
    expect(workActivity('sleeping', false)).toBe('rest')
  })
  it('does not turn intent or locomotion into stationary work', () => {
    expect(workActivity('repairing our House', true)).toBeNull()
    expect(workActivity('seeking fishing spot', false)).toBeNull()
    expect(workActivity('going hunting', false)).toBeNull()
    expect(workActivity('planning building', false)).toBeNull()
    expect(workActivity('observing', false)).toBeNull()
  })
})
