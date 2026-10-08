import { describe, expect, it } from 'vitest'
import { searchWorldTools } from './tool-search'
import { SANDBOX_CATEGORIES } from '../../simulation/sandbox'

describe('searchable world tools', () => {
  it('makes the entire existing catalogue discoverable without duplicate commands', () => {
    const all = searchWorldTools('')
    expect(all.length).toBe(SANDBOX_CATEGORIES.reduce((count, category) => count + category.tools.length, 0))
    expect(new Set(all.map(({ tool }) => tool.id)).size).toBe(all.length)
  })
  it('matches category and tool words together, ignoring case and whitespace', () => {
    expect(searchWorldTools(' HELPFUL   heal ')[0].tool.id).toBe('heal')
    expect(searchWorldTools('terrain water').some(({ tool }) => tool.id === 'water')).toBe(true)
  })
  it('does not offer invented commands for unmatched requests', () => {
    expect(searchWorldTools('teleport planet')).toEqual([])
  })
  it('ranks a tool whose label is the word above one that only mentions it in its tip', () => {
    const ids = searchWorldTools('water').map(({ tool }) => tool.id)
    expect(ids[0]).toBe('water')
  })
  it('finds a tool by what its tip says, not only its name', () => {
    const ids = searchWorldTools('shade').map(({ tool }) => tool.id)
    expect(ids).toContain('plant_mushroom')
  })
})
