import { describe, expect, it } from 'vitest'
import { SANDBOX_CATEGORIES } from '../../simulation/sandbox'
import { DOCK_TABS, NEW_TOOL_IDS, markNewToolsSeen, unseenNewTools } from './dock-tabs'

const NONE = new Set<string>()

describe('new tool marks on the dock tabs', () => {
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

  it('marks a tab seen without touching the others', () => {
    const next = markNewToolsSeen('life', NONE)
    expect(next.has('owl')).toBe(true)
    expect(next.has('heat_wave')).toBe(false)
    expect(unseenNewTools('nature', next)).toEqual(expect.arrayContaining(['heat_wave']))
  })
})
