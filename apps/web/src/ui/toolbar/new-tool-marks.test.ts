import { describe, expect, it } from 'vitest'
import { SANDBOX_CATEGORIES } from '../../simulation/sandbox'
import { DOCK_TABS, NEW_TOOL_IDS, markNewToolsSeen, unseenNewTools, unseenNewToolsInGroup } from './dock-tabs'

const NONE = new Set<string>()

describe('new tool marks on the dock tabs and groups', () => {
  it('names only tools that exist', () => {
    const ids = new Set(SANDBOX_CATEGORIES.flatMap((c) => c.tools.map((t) => t.id)))
    for (const id of NEW_TOOL_IDS) expect(ids.has(id), id).toBe(true)
  })

  it('marks the tab that holds each new tool until the tool has been seen', () => {
    expect(unseenNewTools('nature', NONE)).toEqual(expect.arrayContaining(['heat_wave']))
    expect(unseenNewTools('life', NONE)).toEqual(
      expect.arrayContaining(['owl', 'eagle', 'snake', 'crocodile']),
    )
    expect(unseenNewTools('deadly', NONE).every((id) => id !== 'owl')).toBe(true)
  })

  it('clears once the tools are seen', () => {
    const seen = new Set(NEW_TOOL_IDS)
    for (const tab of DOCK_TABS) expect(unseenNewTools(tab.id, seen)).toEqual([])
  })

  it('marks the group that holds each new tool', () => {
    expect(unseenNewToolsInGroup('birds', NONE)).toEqual(expect.arrayContaining(['owl', 'eagle']))
    expect(unseenNewToolsInGroup('birds', NONE)).not.toContain('snake')
  })

  it('marks a group seen without touching the others', () => {
    const next = markNewToolsSeen('birds', NONE)
    expect(next.has('owl')).toBe(true)
    expect(next.has('snake')).toBe(false)
    expect(next.has('heat_wave')).toBe(false)
    // The tab still holds unseen tools in its other groups.
    expect(unseenNewTools('life', next)).toEqual(expect.arrayContaining(['snake']))
    expect(unseenNewTools('life', next)).not.toContain('owl')
  })
})
