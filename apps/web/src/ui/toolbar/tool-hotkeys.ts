import type { SandboxTool } from '../../simulation/sandbox'

/**
 * Keys that pick the first ten tools on the bar (the open group's). They sit in
 * the letter rows away from the keys the game already uses: WASD pan the
 * map, 1 to 4 set the speed, 0 fits the world, and P, B and H have their own jobs.
 */
export const TOOL_HOTKEYS = ['q', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'f', 'g'] as const

function rowKeys(tools: readonly SandboxTool[]): (string | undefined)[] {
  const all: readonly string[] = TOOL_HOTKEYS
  const own = new Set(
    tools.flatMap((tool) => (tool.hotkey && all.includes(tool.hotkey) ? [tool.hotkey] : [])),
  )
  const free = all.filter((key) => !own.has(key))
  let next = 0
  return tools.map((tool, i) =>
    tool.hotkey && own.has(tool.hotkey) ? tool.hotkey : i < all.length ? free[next++] : undefined,
  )
}

/** The hotkey for each of the row's first ten tools, keyed by tool id. */
export function hotkeysFor(tools: readonly SandboxTool[]): Map<string, string> {
  const keys = new Map<string, string>()
  rowKeys(tools).forEach((key, i) => {
    if (key) keys.set(tools[i].id, key.toUpperCase())
  })
  return keys
}

/** The tool a pressed key picks from this row, or null when the key is not a tool hotkey. */
export function toolForHotkey(tools: readonly SandboxTool[], key: string | undefined): SandboxTool | null {
  // Safari sends some key events with no key at all.
  if (typeof key !== 'string') return null
  const index = rowKeys(tools).indexOf(key.toLowerCase())
  return index < 0 ? null : tools[index]
}
