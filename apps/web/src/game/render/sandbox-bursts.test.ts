import { describe, expect, it } from 'vitest'
import { burstForTool } from './sandbox-bursts'

describe('burstForTool', () => {
  it('erupts a volcano from the ground instead of dropping a meteor on it', () => {
    expect(burstForTool('volcano')).toBe('eruption')
  })

  it('keeps the falling rock for the tools that drop one from the sky', () => {
    for (const tool of ['meteor', 'meteor_shower', 'comet', 'nuke']) expect(burstForTool(tool)).toBe('meteor')
  })
})
