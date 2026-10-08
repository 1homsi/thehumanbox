/**
 * Which dock tools the player keeps close: pinned ones (shift-click a tile to pin or unpin it) and the
 * last few they used. Stored per browser as tool ids only, so a renamed or removed tool is simply skipped.
 */
export const RECENT_LIMIT = 6
export const PINNED_LIMIT = 8
export const TOOL_MEMORY_KEY = 'thb-sandbox-tool-memory'

export interface ToolMemory {
  pinned: string[]
  recent: string[]
}

export const EMPTY_TOOL_MEMORY: ToolMemory = { pinned: [], recent: [] }

/** Moves `id` to the front of the recent list, keeping each id once and the list short. */
export function rememberRecent(memory: ToolMemory, id: string): ToolMemory {
  if (memory.recent[0] === id) return memory
  return { ...memory, recent: [id, ...memory.recent.filter((x) => x !== id)].slice(0, RECENT_LIMIT) }
}

/** Pins `id` if it is not pinned, unpins it if it is. A full pin list refuses new pins. */
export function togglePinned(memory: ToolMemory, id: string): ToolMemory {
  if (memory.pinned.includes(id)) return { ...memory, pinned: memory.pinned.filter((x) => x !== id) }
  if (memory.pinned.length >= PINNED_LIMIT) return memory
  return { ...memory, pinned: [...memory.pinned, id] }
}

/** The ids to show in the memory group: pinned first, then recent ones not already pinned, only for known tools. */
export function memoryToolIds(memory: ToolMemory, known: ReadonlySet<string>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of [...memory.pinned, ...memory.recent]) {
    if (!known.has(id) || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((x) => typeof x === 'string')

/** Parses stored memory, falling back to empty for anything malformed. */
export function parseToolMemory(raw: string | null): ToolMemory {
  if (!raw) return EMPTY_TOOL_MEMORY
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object') return EMPTY_TOOL_MEMORY
    const { pinned, recent } = value as Record<string, unknown>
    return {
      pinned: isStringArray(pinned) ? pinned.slice(0, PINNED_LIMIT) : [],
      recent: isStringArray(recent) ? recent.slice(0, RECENT_LIMIT) : [],
    }
  } catch {
    return EMPTY_TOOL_MEMORY
  }
}

export function readToolMemory(): ToolMemory {
  try {
    return parseToolMemory(window.localStorage.getItem(TOOL_MEMORY_KEY))
  } catch {
    // Storage can be unavailable in private or locked-down contexts: the dock still works without memory.
    return EMPTY_TOOL_MEMORY
  }
}

export function writeToolMemory(memory: ToolMemory): void {
  try {
    window.localStorage.setItem(TOOL_MEMORY_KEY, JSON.stringify(memory))
  } catch {
    // Nothing to do: the choice lasts for this visit only.
  }
}
