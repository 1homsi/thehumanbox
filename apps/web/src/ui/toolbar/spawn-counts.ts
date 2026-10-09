import { create } from 'zustand'
import type { SandboxCommand, SandboxTool } from '../../simulation/sandbox'

/**
 * How many times each spawning tool has landed this session, for the small count on its tile. It is kept
 * in memory only: a reload starts every count again at zero.
 */
interface SpawnCounts {
  counts: Record<string, number>
  bump: (toolId: string) => void
}

export const useSpawnCounts = create<SpawnCounts>()((set) => ({
  counts: {},
  bump: (toolId) => set((s) => ({ counts: { ...s.counts, [toolId]: (s.counts[toolId] ?? 0) + 1 } })),
}))

/** The commands that put new people or animals into the world. */
const SPAWN_COMMANDS: ReadonlySet<SandboxCommand['cmd']> = new Set(['spawn', 'family', 'spawn_animal'])

/** Whether a tool adds people or animals when it lands, so its tile counts how many it has added. */
export function spawnsWith(tool: SandboxTool): boolean {
  const command = tool.build ? tool.build(0, 0, 1) : tool.fire
  return command !== undefined && SPAWN_COMMANDS.has(command.cmd)
}
