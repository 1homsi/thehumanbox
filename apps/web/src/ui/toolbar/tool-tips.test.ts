import { describe, expect, it } from 'vitest'
import { SANDBOX_CATEGORIES, type SandboxTool } from '../../simulation/sandbox'
import { toolHowTo, toolReach } from './tool-tips'

function toolById(id: string): SandboxTool {
  const tool = SANDBOX_CATEGORIES.flatMap((c) => c.tools).find((t) => t.id === id)
  if (!tool) throw new Error(`no tool ${id}`)
  return tool
}

describe('a point tool says what the brush reaches', () => {
  it('gives the radius in tiles, and it grows with the brush', () => {
    const rain = toolById('rain_patch')
    expect(toolReach(rain, 0)).toContain('reaches 4 tiles')
    expect(toolReach(rain, 3)).toContain('reaches 7 tiles')
  })

  it('says how many a tool brings only when it brings several', () => {
    expect(toolReach(toolById('spawn5'), 2)).toContain('brings 5')
    expect(toolReach(toolById('owl'), 2)).not.toContain('brings')
  })

  it('puts the reach in the hint line of a point tool', () => {
    expect(toolHowTo(toolById('rain_patch'), 1)).toContain('reaches 5 tiles')
    expect(toolHowTo(toolById('rain_patch'), 1)).toContain('- = brush')
  })

  it('says nothing about a reach for an instant tool or a layer', () => {
    expect(toolReach(toolById('rain'), 2)).toBe('')
    expect(toolHowTo(toolById('rain'), 2)).toBe('click to apply at once')
  })
})
