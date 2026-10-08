import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { SANDBOX_CATEGORIES } from '../../simulation/sandbox'
import { DOCK_TABS, SPEED_TOOL_IDS, TIME_CATEGORY_ID, groupsFor, resolveTab } from './dock-tabs'
import { toolTip, toolFailure } from './tool-tips'
import { ToolSprite } from './ToolSprite'
import { burstForTool } from '../../game/render/sandbox-bursts'

const dockCategories = SANDBOX_CATEGORIES.filter((c) => c.id !== TIME_CATEGORY_ID)
const dockTools = dockCategories.flatMap((c) => c.tools)
const cursorSprite = renderToStaticMarkup(createElement(ToolSprite, { icon: '🖱️' }))

describe('dock layout stays complete as tools are added', () => {
  it('places every tool category in exactly one tab', () => {
    for (const category of dockCategories) {
      const tabs = DOCK_TABS.filter((tab) => tab.groups.includes(category.id))
      expect(
        tabs.map((t) => t.id),
        `category ${category.id}`,
      ).toHaveLength(1)
    }
  })

  it('names every tool uniquely within its tab', () => {
    for (const tab of DOCK_TABS) {
      const labels = groupsFor(tab.id).flatMap((g) => g.tools.map((t) => t.label))
      expect(new Set(labels).size, `duplicate tool names in ${tab.id}: ${labels.join(', ')}`).toBe(
        labels.length,
      )
    }
  })

  it('only references categories that exist', () => {
    for (const tab of DOCK_TABS) {
      expect(groupsFor(tab.id)).toHaveLength(tab.groups.length)
    }
  })

  it('gives every tool a real description, sprite, and failure reason', () => {
    for (const tool of dockTools) {
      expect(toolTip(tool), `tooltip for ${tool.id}`).not.toBe(tool.label)
      expect(toolFailure(tool), `failure text for ${tool.id}`).toBeTruthy()
      expect(
        renderToStaticMarkup(createElement(ToolSprite, { icon: tool.icon })),
        `sprite for ${tool.id}`,
      ).not.toBe(cursorSprite)
    }
    for (const tab of DOCK_TABS) {
      expect(renderToStaticMarkup(createElement(ToolSprite, { icon: tab.icon })), `tab ${tab.id}`).not.toBe(
        cursorSprite,
      )
    }
  })

  it('makes every tool do something when used', () => {
    // Follow is a camera action, not a world command, so it has no command to build.
    const clientOnly = new Set(['follow'])
    for (const tool of dockTools) {
      if (tool.mode === 'point') {
        if (!clientOnly.has(tool.id)) {
          const command = tool.build?.(120, 80, 2)
          expect(command, `point tool ${tool.id} builds a command`).toBeDefined()
          expect(command).toMatchObject({ x: 120, y: 80 })
        }
        expect(burstForTool(tool.id), `point tool ${tool.id} plays an effect`).not.toBeNull()
      } else {
        expect(tool.fire ?? tool.time ?? tool.view, `instant tool ${tool.id} has an action`).toBeDefined()
      }
    }
  })

  it('offers next season and next year as time tools that run the world on to that boundary', () => {
    const time = SANDBOX_CATEGORIES.find((c) => c.id === TIME_CATEGORY_ID)?.tools ?? []
    expect(time.find((t) => t.id === 'next_season')?.time).toEqual({ control: 'advance', to: 'season' })
    expect(time.find((t) => t.id === 'next_year')?.time).toEqual({ control: 'advance', to: 'year' })
  })

  it('offers only speeds that exist as time tools', () => {
    const time = SANDBOX_CATEGORIES.find((c) => c.id === TIME_CATEGORY_ID)?.tools ?? []
    for (const id of SPEED_TOOL_IDS)
      expect(
        time.some((t) => t.id === id),
        id,
      ).toBe(true)
  })

  it('restores tabs saved by the older one-tab-per-category dock', () => {
    expect(resolveTab('animals')).toBe('life')
    expect(resolveTab('terrain')).toBe('world')
    expect(resolveTab('disasters')).toBe('powers')
    expect(resolveTab('maps')).toBe('maps')
    expect(resolveTab('nonsense')).toBe('life')
    expect(resolveTab(null)).toBe('life')
  })
})
