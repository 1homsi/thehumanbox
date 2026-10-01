import { SANDBOX_CATEGORIES, type SandboxCategory } from '../simulation/sandbox'

/**
 * Layout of the world dock. Each tab lists the sandbox categories it shows;
 * every category becomes one divided group of tiles in that tab.
 *
 * Adding a tool:
 *   1. Add it to its category in `simulation/sandbox.ts`.
 *   2. Give it a sprite in `ToolSprite.tsx` and a line in `tool-tips.ts`.
 *   3. If it needs a new effect when it lands, map it in `2d/world/SandboxBursts.tsx`.
 * Adding a category: create it in `sandbox.ts`, then list its id in one tab
 * below. `dock-tabs.test.ts` fails if any tool or category is left out.
 */
export interface DockTab {
  id: string
  label: string
  icon: string
  tip: string
  groups: string[]
}

export const DOCK_TABS: DockTab[] = [
  {
    id: 'life',
    label: 'life',
    icon: '🚶',
    tip: 'People, animals, and monsters',
    groups: ['life', 'animals', 'monsters'],
  },
  {
    id: 'world',
    label: 'world',
    icon: '⛰️',
    tip: 'Terrain, resources, and buildings',
    groups: ['terrain', 'resources', 'build'],
  },
  {
    id: 'powers',
    label: 'powers',
    icon: '⛈️',
    tip: 'Helpful powers, then deadly ones',
    groups: ['good', 'bad'],
  },
  { id: 'maps', label: 'maps', icon: '🗺️', tip: 'Map layers you can switch on and off', groups: ['maps'] },
]

/** Time controls live in the dock's time panel rather than in a tab. */
export const TIME_CATEGORY_ID = 'time'

/** Speeds offered as buttons under the play control, by time-tool id. */
export const SPEED_TOOL_IDS = ['normal', 'fast2', 'fast4', 'fast10', 'fast40', 'fast500', 'fast5000']

export function groupsFor(tabId: string): SandboxCategory[] {
  const tab = DOCK_TABS.find((t) => t.id === tabId) ?? DOCK_TABS[0]
  return tab.groups.flatMap((id) => SANDBOX_CATEGORIES.filter((c) => c.id === id))
}

/** Resolve a stored tab id, accepting the category ids older saves used. */
/** Groups older docks had, mapped to the tab that now holds their tools. */
const RETIRED_GROUPS: Record<string, string> = { divine: 'powers', nature: 'powers', disasters: 'powers' }

export function resolveTab(saved: string | null): string {
  const id = saved !== null ? (RETIRED_GROUPS[saved] ?? saved) : null
  const tab = DOCK_TABS.find((t) => t.id === id || (id !== null && t.groups.includes(id)))
  return tab ? tab.id : DOCK_TABS[0].id
}
