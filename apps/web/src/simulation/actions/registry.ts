import type { MessageKey } from '../../i18n'
import type { DamageCause } from '../command-outcome'
import type { PairTool, SandboxCategory, SandboxCommand, SandboxTool } from '../sandbox'
import builtin from './builtin-actions.json'
import {
  brushRadius,
  fillTemplate,
  reachOf,
  type ActionDef,
  type ActionManifest,
  type CommandTemplate,
  type ReachRule,
  type TabDef,
  type TemplateSlots,
} from './manifest'

export const BUILTIN_ACTIONS = builtin as ActionManifest

function emit(template: CommandTemplate, slots: TemplateSlots): SandboxCommand {
  return fillTemplate(template, slots) as unknown as SandboxCommand
}

const POINT_MODE = new Set(['brush', 'point', 'pair', 'person'])

export function toolFromAction(action: ActionDef): SandboxTool {
  const { command, radius } = action
  const tool: SandboxTool = {
    id: action.id,
    label: action.label,
    icon: action.icon,
    mode: POINT_MODE.has(action.target) ? 'point' : 'instant',
    target: action.target,
  }
  if (action.name) tool.name = action.name as MessageKey
  if (action.tip) tool.tip = action.tip as MessageKey
  if (action.failure) tool.failure = action.failure as MessageKey
  if (action.overlay) tool.overlay = action.overlay
  if (action.hotkey) tool.hotkey = action.hotkey
  if (action.view) tool.view = action.view
  if (action.time) tool.time = action.time
  if (command && action.target === 'brush' && radius)
    tool.build = (x, y, brush) => emit(command, { x, y, radius: brushRadius(radius, brush) })
  else if (command && action.target === 'point') tool.build = (x, y) => emit(command, { x, y })
  else if (command && (action.target === 'global' || action.target === 'random'))
    tool.fire = emit(command, {})
  return tool
}

function pairFromAction(action: ActionDef): PairTool | null {
  const { command, pair } = action
  if (action.target !== 'pair' || !command || !pair) return null
  return {
    next: pair.next as MessageKey,
    done: pair.done as MessageKey,
    failed: pair.failed as MessageKey,
    build: (a, b) => emit(command, { ax: a.x, ay: a.y, bx: b.x, by: b.y }),
  }
}

export interface ActionRegistry {
  categories: SandboxCategory[]
  tools: ReadonlyMap<string, SandboxTool>
  tabs: TabDef[]
  pairs: Record<string, PairTool>
  randomEvents: ReadonlyArray<(x: number, y: number) => SandboxCommand>
  reachByCommand: ReadonlyMap<string, ReachRule>
  causeByCommand: ReadonlyMap<string, DamageCause>
}

function commandOf(action: ActionDef): string | null {
  return action.target === 'brush' || action.target === 'point' ? (action.command?.cmd ?? null) : null
}

export function buildRegistry(manifest: ActionManifest): ActionRegistry {
  const categories: SandboxCategory[] = manifest.groups.map((g) => ({
    id: g.id,
    label: g.label,
    icon: g.icon,
    ...(g.name ? { name: g.name as MessageKey } : {}),
    tools: [],
  }))
  const byGroup = new Map(categories.map((c) => [c.id, c]))
  const pairs: Record<string, PairTool> = {}
  const randomEvents: ((x: number, y: number) => SandboxCommand)[] = []
  const reachByCommand = new Map<string, ReachRule>()
  const causeByCommand = new Map<string, DamageCause>()
  for (const action of manifest.actions) {
    const category = byGroup.get(action.group)
    if (!category) throw new Error(`action ${action.id} is in unknown group ${action.group}`)
    category.tools.push(toolFromAction(action))
    const pair = pairFromAction(action)
    if (pair) pairs[action.id] = pair
    for (const event of action.target === 'random' ? (action.events ?? []) : [])
      randomEvents.push((x, y) => emit(event, { x, y }))
    const cmd = commandOf(action)
    if (cmd && action.reach) reachByCommand.set(cmd, action.reach)
    if (cmd && action.cause) causeByCommand.set(cmd, action.cause)
  }
  const tools = new Map(categories.flatMap((c) => c.tools.map((tool) => [tool.id, tool] as const)))
  return { categories, tools, tabs: manifest.tabs ?? [], pairs, randomEvents, reachByCommand, causeByCommand }
}

export const REGISTRY = buildRegistry(BUILTIN_ACTIONS)

export function commandReach(cmd: SandboxCommand): number {
  const radius = 'radius' in cmd && typeof cmd.radius === 'number' ? cmd.radius : 0
  return reachOf(REGISTRY.reachByCommand.get(cmd.cmd), radius)
}
