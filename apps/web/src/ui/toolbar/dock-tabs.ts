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
    tip: 'People, their helpers, and the monsters that stalk them',
    groups: ['life', 'monsters'],
  },
  {
    id: 'animals',
    label: 'animals',
    icon: '🦌',
    tip: 'Wild and tame animals, from foxes to whales',
    groups: ['animals'],
  },
  {
    id: 'wild',
    label: 'wild',
    icon: '🐒',
    tip: 'Animals of far lands and the wild: monkeys, goats and elephants, birds of prey, snakes and crocodiles',
    groups: ['birds', 'reptiles', 'safari'],
  },
  {
    id: 'world',
    label: 'world',
    icon: '⛰️',
    tip: 'Terrain and biomes: what the ground is',
    groups: ['terrain', 'biomes'],
  },
  {
    id: 'heavens',
    label: 'sky',
    icon: '🌅',
    tip: 'The time of day, eclipses and comets, dice, the bomb, the eras, and blessings of the land and of one person',
    groups: ['sky', 'miracles', 'eras'],
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
    id: 'tribes',
    label: 'tribes',
    icon: '👥',
    tip: 'Gifts and moves for whole tribes: food and tools for every member, a forced migration, and a trade of food between two tribes',
    groups: ['tribes'],
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
 * Tools added since the last release. A tab that holds one the player has not seen shows a
 * "new" mark; opening the tab marks its new tools seen. Remove an id once it is old news.
 */
export const NEW_TOOL_IDS: readonly string[] = [
  'heat_wave',
  'owl',
  'eagle',
  'snake',
  'crocodile',
  'bless_river',
  'bless_forest',
  'talent',
  'era_stone',
  'era_bronze',
  'era_medieval',
  'era_modern',
  'tribe_food',
  'tribe_tools',
  'migrate_tribe',
  'trade_gift',
  'goat',
  'elephant',
  'monkey',
  'lava',
  'lion',
  'zebra',
  'polar_bear',
  'kangaroo',
  'frost',
]

const SEEN_NEW_STORAGE_KEY = 'thb-seen-new-tools'

/** The new tools a tab holds that the player has not seen yet. */
export function unseenNewTools(tabId: string, seen: ReadonlySet<string>): string[] {
  const here = new Set(groupsFor(tabId).flatMap((c) => c.tools.map((t) => t.id)))
  return NEW_TOOL_IDS.filter((id) => here.has(id) && !seen.has(id))
}

/** The new tools seen so far, from browser storage (empty when storage is unavailable). */
export function readSeenNewTools(): Set<string> {
  try {
    const raw = window.localStorage.getItem(SEEN_NEW_STORAGE_KEY)
    const ids: unknown = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [])
  } catch {
    return new Set()
  }
}

/** Marks the new tools in a tab as seen, and returns the updated set. */
export function markNewToolsSeen(tabId: string, seen: ReadonlySet<string>): Set<string> {
  const next = new Set(seen)
  for (const id of unseenNewTools(tabId, seen)) next.add(id)
  if (next.size === seen.size) return next
  try {
    window.localStorage.setItem(SEEN_NEW_STORAGE_KEY, JSON.stringify([...next]))
  } catch {
    // The mark simply shows again next visit when storage is unavailable.
  }
  return next
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
  // Tab ids that were merged: their groups now sit in the tabs named here.
  safari: 'wild',
  miracles: 'heavens',
}

/** Resolve a stored tab id, accepting the category ids older saves used. */
export function resolveTab(saved: string | null): string {
  const id = saved !== null ? (RETIRED_GROUPS[saved] ?? saved) : null
  const tab = DOCK_TABS.find((t) => t.id === id || (id !== null && t.groups.includes(id)))
  return tab ? tab.id : DOCK_TABS[0].id
}
