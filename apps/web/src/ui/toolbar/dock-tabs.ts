import { SANDBOX_CATEGORIES, type SandboxCategory, type SandboxTool } from '../../simulation/sandbox'

/**
 * Layout of the world dock. Each tab is a category word on the bar and lists the sandbox
 * categories it holds; every one of those becomes a group chip, and the open group's tools fill
 * the bar's single row.
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
    tip: 'People, their helpers, the monsters that stalk them, and every animal from foxes to whales',
    groups: ['life', 'monsters', 'animals', 'birds', 'reptiles', 'safari'],
  },
  {
    id: 'nature',
    label: 'nature',
    icon: '⛰️',
    tip: 'Terrain and biomes, the sky and the time of day, eclipses and comets, the eras, and blessings of the land',
    groups: ['terrain', 'biomes', 'sky', 'miracles', 'eras'],
  },
  {
    id: 'resources',
    label: 'resources',
    icon: '🍎',
    tip: 'Food, plantings and buildings, and the blessings, weather and healing you can give',
    groups: ['resources', 'build', 'good'],
  },
  {
    id: 'deadly',
    label: 'deadly',
    icon: '💀',
    tip: 'Disasters, plagues, and war',
    groups: ['bad'],
  },
  {
    id: 'world',
    label: 'world',
    icon: '🗺️',
    tip: 'Whole tribes (food and tools for every member, a forced migration, a trade of food) and the map layers',
    groups: ['tribes', 'maps', 'view'],
  },
]

/** Time controls live in the bar's time control rather than in a tab. */
export const TIME_CATEGORY_ID = 'time'

/** Every speed the time tools offer, slowest first: the time control's list. */
export function speedTools(): SandboxTool[] {
  const time = SANDBOX_CATEGORIES.find((c) => c.id === TIME_CATEGORY_ID)?.tools ?? []
  return time
    .filter((t) => t.time?.control === 'speed' && typeof t.time.mult === 'number')
    .sort((a, b) => (a.time?.mult ?? 0) - (b.time?.mult ?? 0))
}

/** Brush presets: the size shown (tiles from the centre to the edge, counting the centre) and the brush value it sets. */
export const BRUSH_SIZES: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [2, 1],
  [3, 2],
  [5, 4],
]

export function groupsFor(tabId: string): SandboxCategory[] {
  const tab = DOCK_TABS.find((t) => t.id === tabId) ?? DOCK_TABS[0]
  return tab.groups.flatMap((id) => SANDBOX_CATEGORIES.filter((c) => c.id === id))
}

/** The life tab's own group is its people; under the word "life" the chip says so. */
const GROUP_LABELS: Record<string, string> = { life: 'people' }

/** What a group's chip on the bar says. */
export function groupLabel(group: SandboxCategory): string {
  return GROUP_LABELS[group.id] ?? group.label
}

/** The group a tab opens on: the remembered one while it is still in the tab, else its first. */
export function resolveGroup(tabId: string, remembered: string | null | undefined): string {
  const groups = groupsFor(tabId)
  return groups.find((g) => g.id === remembered)?.id ?? groups[0]?.id ?? ''
}

const GROUP_STORAGE_KEY = 'thb-sandbox-groups'

/** The last group opened in each tab, from browser storage (empty when storage is unavailable). */
export function readRememberedGroups(): Record<string, string> {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(GROUP_STORAGE_KEY) ?? '{}')
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
    return Object.fromEntries(
      Object.entries(raw).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    )
  } catch {
    return {}
  }
}

/** Remembers the group opened in a tab, and returns the updated record. */
export function rememberGroup(
  remembered: Readonly<Record<string, string>>,
  tabId: string,
  groupId: string,
): Record<string, string> {
  const next = { ...remembered, [tabId]: groupId }
  try {
    window.localStorage.setItem(GROUP_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // The bar still works when browser storage is unavailable; it just forgets on reload.
  }
  return next
}

/**
 * Tools added since the last release. A tab and a group that hold one the player has not seen
 * show a "new" mark; opening the group marks its new tools seen. Remove an id once it is old news.
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
  'boat',
]

const SEEN_NEW_STORAGE_KEY = 'thb-seen-new-tools'

function unseenIn(groups: readonly SandboxCategory[], seen: ReadonlySet<string>): string[] {
  const here = new Set(groups.flatMap((c) => c.tools.map((t) => t.id)))
  return NEW_TOOL_IDS.filter((id) => here.has(id) && !seen.has(id))
}

/** The new tools a tab holds that the player has not seen yet. */
export function unseenNewTools(tabId: string, seen: ReadonlySet<string>): string[] {
  return unseenIn(groupsFor(tabId), seen)
}

/** The new tools one group holds that the player has not seen yet. */
export function unseenNewToolsInGroup(groupId: string, seen: ReadonlySet<string>): string[] {
  return unseenIn(
    SANDBOX_CATEGORIES.filter((c) => c.id === groupId),
    seen,
  )
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

/** Marks the new tools in a group as seen, and returns the updated set. */
export function markNewToolsSeen(groupId: string, seen: ReadonlySet<string>): Set<string> {
  const next = new Set(seen)
  for (const id of unseenNewToolsInGroup(groupId, seen)) next.add(id)
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
 * The dock went from many small tabs to five; the old one-tab-per-category dock is covered too.
 */
const RETIRED_GROUPS: Record<string, string> = {
  powers: 'resources',
  divine: 'resources',
  helpful: 'resources',
  disasters: 'deadly',
  // Tab ids that were merged: their groups now sit in the tabs named here.
  animals: 'life',
  wild: 'life',
  safari: 'life',
  heavens: 'nature',
  miracles: 'nature',
  tribes: 'world',
  maps: 'world',
}

/** Resolve a stored tab id, accepting the category ids older saves used. */
export function resolveTab(saved: string | null): string {
  const id = saved !== null ? (RETIRED_GROUPS[saved] ?? saved) : null
  const tab = DOCK_TABS.find((t) => t.id === id || (id !== null && t.groups.includes(id)))
  return tab ? tab.id : DOCK_TABS[0].id
}
