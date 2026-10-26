import { afterEach, describe, expect, it, vi } from 'vitest'
import { SANDBOX_CATEGORIES } from '../../simulation/sandbox'
import {
  DOCK_TABS,
  NEW_TOOL_IDS,
  markNewToolsSeen,
  readSeenNewTools,
  unseenNewTools,
  unseenNewToolsInGroup,
} from './dock-tabs'

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

describe('new tool marks for a player who has never opened the dock', () => {
  const KEY = 'thb-seen-new-tools'
  afterEach(() => vi.unstubAllGlobals())

  function storage(initial: Record<string, string> = {}) {
    const data = new Map(Object.entries(initial))
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => data.get(key) ?? null,
        setItem: (key: string, value: string) => void data.set(key, String(value)),
      },
    })
    return data
  }

  it('shows no new marks on a first visit, and remembers that', () => {
    const data = storage()
    const seen = readSeenNewTools()
    for (const id of NEW_TOOL_IDS) expect(seen.has(id), id).toBe(true)
    for (const tab of DOCK_TABS) expect(unseenNewTools(tab.id, seen)).toEqual([])
    expect(JSON.parse(data.get(KEY)!)).toEqual([...NEW_TOOL_IDS])
  })

  it('still marks a tool added after the player last saw the dock', () => {
    storage({ [KEY]: JSON.stringify(NEW_TOOL_IDS.filter((id) => id !== 'lava')) })
    expect(unseenNewTools('nature', readSeenNewTools())).toEqual(['lava'])
  })

  it('keeps the marks hidden when storage cannot be read', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('blocked')
        },
      },
    })
    const seen = readSeenNewTools()
    for (const tab of DOCK_TABS) expect(unseenNewTools(tab.id, seen)).toEqual([])
  })
})
