import { describe, expect, it } from 'vitest'
import { SANDBOX_CATEGORIES, type SandboxTool } from '../../simulation/sandbox'
import { spawnsWith, useSpawnCounts } from './spawn-counts'

const tools = SANDBOX_CATEGORIES.flatMap((c) => c.tools)
const find = (id: string): SandboxTool => {
  const tool = tools.find((t) => t.id === id)
  if (!tool) throw new Error(`no tool ${id}`)
  return tool
}

describe('spawn counts', () => {
  it('marks the tools that add people or animals, and only those', () => {
    expect(spawnsWith(find('spawn1'))).toBe(true)
    expect(spawnsWith(find('spawn5'))).toBe(true)
    expect(spawnsWith(find('family'))).toBe(true)
    expect(spawnsWith(find('deer'))).toBe(true)
    expect(spawnsWith(find('heal'))).toBe(false)
    expect(spawnsWith(find('tame'))).toBe(false)
    expect(spawnsWith(find('smite'))).toBe(false)
  })

  it('counts each landing of a tool separately from the others', () => {
    useSpawnCounts.setState({ counts: {} })
    useSpawnCounts.getState().bump('spawn5')
    useSpawnCounts.getState().bump('spawn5')
    useSpawnCounts.getState().bump('family')
    expect(useSpawnCounts.getState().counts).toEqual({ spawn5: 2, family: 1 })
  })
})
