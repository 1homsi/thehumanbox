import { describe, expect, it } from 'vitest'
import { DOCK_TABS, groupsFor } from './dock-tabs'

/** The tool ids a tab shows, in order. */
const idsIn = (tabId: string) => groupsFor(tabId).flatMap((g) => g.tools.map((t) => t.id))

describe('every tool appears exactly once on the dock', () => {
  it('lists no tool twice within a tab', () => {
    for (const tab of DOCK_TABS) {
      const ids = idsIn(tab.id)
      expect(new Set(ids).size, `tab ${tab.id} repeats a tool`).toBe(ids.length)
    }
  })

  it('lists no tool in two tabs', () => {
    const home = new Map<string, string>()
    for (const tab of DOCK_TABS) {
      for (const id of idsIn(tab.id)) {
        const other = home.get(id)
        expect(other, `${id} is in both ${other} and ${tab.id}`).toBeUndefined()
        home.set(id, tab.id)
      }
    }
  })
})
