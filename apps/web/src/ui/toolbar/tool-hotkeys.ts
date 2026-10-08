import type { SandboxTool } from '../../simulation/sandbox'

/**
 * Keys that pick the first ten tools of the open dock tab. They sit in
 * the letter rows away from the keys the game already uses: WASD pan the
 * map, 1 to 4 set the speed, 0 fits the world, and P, B and H have their own jobs.
 */
export const TOOL_HOTKEYS = ['q', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'f', 'g'] as const

/** The hotkey for each of the tab's first ten tools, keyed by tool id. */
export function hotkeysFor(tools: readonly SandboxTool[]): Map<string, string> {
  const keys = new Map<string, string>()
  tools.slice(0, TOOL_HOTKEYS.length).forEach((tool, i) => keys.set(tool.id, TOOL_HOTKEYS[i].toUpperCase()))
  return keys
}

/** The tool a pressed key picks in this tab, or null when the key is not a tool hotkey. */
export function toolForHotkey(tools: readonly SandboxTool[], key: string): SandboxTool | null {
  const index = (TOOL_HOTKEYS as readonly string[]).indexOf(key.toLowerCase())
  if (index < 0) return null
  return tools[index] ?? null
}
