import { SANDBOX_CATEGORIES, type SandboxCategory } from '../../simulation/sandbox'

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
/** Tile columns a tab may take up (two tiles per column): 11 columns of 40px tiles fit beside the time panel at 768 wide. */
export const MAX_TAB_COLUMNS = 11

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
    tip: 'People and the helpers you send to them',
    groups: ['life'],
  },
  {
    id: 'animals',
    label: 'animals',
    icon: '🦌',
    tip: 'Wild and tame animals, and monsters',
    groups: ['animals', 'monsters'],
  },
  {
    id: 'world',
    label: 'world',
    icon: '⛰️',
    tip: 'Terrain and biomes: what the ground is',
    groups: ['terrain', 'biomes'],
  },
  {
    id: 'resources',
    label: 'resources',
    icon: '🍎',
    tip: 'Food, plantings, and buildings',
    groups: ['resources', 'build'],
  },
  {
    id: 'helpful',
    label: 'helpful',
    icon: '✨',
    tip: 'Blessings, weather you can summon, and healing',
    groups: ['good'],
  },
  {
    id: 'deadly',
    label: 'deadly',
    icon: '💀',
    tip: 'Disasters, plagues, and war',
    groups: ['bad'],
  },
  {
    id: 'maps',
    label: 'maps',
    icon: '🗺️',
    tip: 'Map layers and what the map shows',
    groups: ['maps', 'view'],
  },
]

/** Time controls live in the dock's time panel rather than in a tab. */
export const TIME_CATEGORY_ID = 'time'

/** Brush presets: the size shown (tiles from the centre to the edge, counting the centre) and the brush value it sets. */
export const BRUSH_SIZES: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [2, 1],
  [3, 2],
  [5, 4],
]

/** Speeds offered as buttons under the play control, by time-tool id. */
export const SPEED_TOOL_IDS = ['normal', 'fast2', 'fast4', 'fast10']

export function groupsFor(tabId: string): SandboxCategory[] {
  const tab = DOCK_TABS.find((t) => t.id === tabId) ?? DOCK_TABS[0]
  return tab.groups.flatMap((id) => SANDBOX_CATEGORIES.filter((c) => c.id === id))
}

/**
 * Tab ids and groups older docks used, mapped to the tab that now holds their tools.
 * The powers tab was split into helpful and deadly; the old one-tab-per-category dock is covered too.
 */
const RETIRED_GROUPS: Record<string, string> = {
  powers: 'helpful',
  divine: 'helpful',
  nature: 'helpful',
  disasters: 'deadly',
}

/** Resolve a stored tab id, accepting the category ids older saves used. */
export function resolveTab(saved: string | null): string {
  const id = saved !== null ? (RETIRED_GROUPS[saved] ?? saved) : null
  const tab = DOCK_TABS.find((t) => t.id === id || (id !== null && t.groups.includes(id)))
  return tab ? tab.id : DOCK_TABS[0].id
}
