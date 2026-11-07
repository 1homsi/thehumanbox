import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PAIR_TOOLS, SANDBOX_CATEGORIES, type SandboxCommand } from './sandbox'

/**
 * Every command the dock can send, as the simulation's audit test replays it
 * (crates/sim-core/src/sim/command/dock_audit_tests.rs). Point tools are built at (0, 0) with the
 * default brush; the Rust test moves each one onto a lived-in spot before it runs it. Tools that never
 * reach the simulation (map views, time, follow, name and the dice's placeholder) are left out.
 *
 * After adding or changing a tool, refresh the list with `UPDATE_DOCK_COMMANDS=1 pnpm vitest run dock-commands`.
 */
const FIXTURE = fileURLToPath(
  new URL('../../../../crates/sim-core/src/sim/command/dock_commands.json', import.meta.url),
)

const DEFAULT_BRUSH = 2

export function dockCommands(): { tool: string; cmd: SandboxCommand }[] {
  const out: { tool: string; cmd: SandboxCommand }[] = []
  for (const category of SANDBOX_CATEGORIES) {
    for (const tool of category.tools) {
      if (tool.id === 'dice') continue
      const pair = PAIR_TOOLS[tool.id]
      if (pair) out.push({ tool: tool.id, cmd: pair.build({ x: 0, y: 0 }, { x: 0, y: 0 }) })
      else if (tool.build) out.push({ tool: tool.id, cmd: tool.build(0, 0, DEFAULT_BRUSH) })
      else if (tool.fire) out.push({ tool: tool.id, cmd: tool.fire })
    }
  }
  return out
}

describe('the dock commands the simulation audits', () => {
  it('match the list the Rust audit replays', () => {
    const text = `[\n${dockCommands()
      .map((entry) => `  ${JSON.stringify(entry)}`)
      .join(',\n')}\n]\n`
    if (process.env.UPDATE_DOCK_COMMANDS) writeFileSync(FIXTURE, text)
    expect(readFileSync(FIXTURE, 'utf8')).toBe(text)
  })
})
