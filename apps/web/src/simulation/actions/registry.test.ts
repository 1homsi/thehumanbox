import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import en from '../../i18n/locales/en'
import { hotkeysFor, toolForHotkey } from '../../ui/toolbar/tool-hotkeys'
import { firesOnPick, toolFailure } from '../../ui/toolbar/tool-tips'
import { DOCK_TABS } from '../../ui/toolbar/dock-tabs'
import { damageCauseOf } from '../command-outcome'
import {
  PAIR_TOOLS,
  SANDBOX_CATEGORIES,
  canPlaceAlongDrag,
  commandReach,
  rollRandomEvent,
  type SandboxTool,
} from '../sandbox'
import schema from './action-manifest.schema.json'
import type { ActionManifest } from './manifest'
import { BUILTIN_ACTIONS, buildRegistry } from './registry'
import { schemaErrors } from './schema-check'

const BRUSHES = [0, 1, 2, 3, 4, 7, 11]

type LegacyGroup = { group: string; label: string; icon: string; hotkeys: string[] }
type LegacyTool = { group: string; id: string } & Record<string, unknown>
type LegacyDice = { dice: number; cmd: string }

const legacy: (LegacyGroup | LegacyTool | LegacyDice)[] = readFileSync(
  new URL('./legacy-dock.snapshot.jsonl', import.meta.url),
  'utf8',
)
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line))

function current(category: (typeof SANDBOX_CATEGORIES)[number], tool: SandboxTool): LegacyTool {
  const pair = PAIR_TOOLS[tool.id]
  const row: Record<string, unknown> = {
    group: category.id,
    id: tool.id,
    label: tool.label,
    icon: tool.icon,
    mode: tool.mode,
    overlay: tool.overlay,
    fire: tool.fire ? JSON.stringify(tool.fire) : undefined,
    time: tool.time,
    view: tool.view,
    built: tool.build ? BRUSHES.map((b) => JSON.stringify(tool.build!(13, 27, b))) : undefined,
    reach: tool.build ? BRUSHES.map((b) => commandReach(tool.build!(13, 27, b))) : undefined,
    cause: tool.build ? damageCauseOf(tool.build(0, 0, 0).cmd) : undefined,
    pair: pair
      ? {
          next: pair.next,
          done: pair.done,
          failed: pair.failed,
          built: JSON.stringify(pair.build({ x: 3, y: 4 }, { x: 50, y: 61 })),
        }
      : undefined,
    failure: toolFailure(tool),
    firesOnPick: firesOnPick(tool),
    dragPlaces: canPlaceAlongDrag(tool),
  }
  return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined)) as LegacyTool
}

describe('the action registry against the dock it replaced', () => {
  it('builds every group and tool in the same order, sending the same command JSON at every brush', () => {
    const now: (LegacyGroup | LegacyTool)[] = SANDBOX_CATEGORIES.flatMap((category) => [
      {
        group: category.id,
        label: category.label,
        icon: category.icon,
        hotkeys: [...hotkeysFor(category.tools)].map(([id, key]) => `${id}=${key}`),
      },
      ...category.tools.map((tool) => current(category, tool)),
    ])
    expect(now).toEqual(legacy.filter((row) => !('dice' in row)))
  })

  it('rolls the same dice events', () => {
    const dice = legacy.filter((row): row is LegacyDice => 'dice' in row)
    expect(dice).toHaveLength(REGISTRY_EVENTS)
    for (const { dice: i, cmd } of dice) {
      const picks = [(i + 0.5) / dice.length, 0.25, 0.75]
      let n = 0
      expect(JSON.stringify(rollRandomEvent(200, 100, () => picks[n++]))).toBe(cmd)
    }
  })

  it('picks the same tool for each hotkey', () => {
    for (const category of SANDBOX_CATEGORIES) {
      for (const [id, key] of hotkeysFor(category.tools))
        expect(toolForHotkey(category.tools, key.toLowerCase())?.id).toBe(id)
      expect(toolForHotkey(category.tools, 'z')).toBeNull()
    }
  })
})

const REGISTRY_EVENTS = BUILTIN_ACTIONS.actions.find((a) => a.target === 'random')?.events?.length ?? 0

describe('the built-in action manifest', () => {
  it('follows the action manifest schema', () => {
    expect(schemaErrors(schema, BUILTIN_ACTIONS)).toEqual([])
  })

  it('is plain data', () => {
    expect(JSON.parse(JSON.stringify(BUILTIN_ACTIONS))).toEqual(BUILTIN_ACTIONS)
  })

  it('gives every action a unique id in a known group', () => {
    const ids = BUILTIN_ACTIONS.actions.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
    const groups = new Set(BUILTIN_ACTIONS.groups.map((g) => g.id))
    expect(BUILTIN_ACTIONS.actions.filter((a) => !groups.has(a.group))).toEqual([])
  })

  it('names only English text that exists', () => {
    const has = (key: string) =>
      typeof key
        .split('.')
        .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], en) ===
      'string'
    const keys = [
      ...BUILTIN_ACTIONS.actions.flatMap((a) => [
        a.name,
        a.tip,
        a.failure,
        a.pair?.next,
        a.pair?.done,
        a.pair?.failed,
      ]),
      ...BUILTIN_ACTIONS.groups.map((g) => g.name),
      ...(BUILTIN_ACTIONS.tabs ?? []).flatMap((tab) => [tab.name, tab.tip]),
    ].filter((key): key is string => key !== undefined)
    expect(keys.filter((key) => !has(key))).toEqual([])
  })

  it('agrees on the reach and damage of a command several actions send', () => {
    const seen = new Map<string, string>()
    for (const action of BUILTIN_ACTIONS.actions) {
      if (!action.command || (!action.reach && !action.cause)) continue
      const rule = JSON.stringify([action.reach ?? null, action.cause ?? null])
      const before = seen.get(action.command.cmd)
      if (before !== undefined) expect(rule).toBe(before)
      seen.set(action.command.cmd, rule)
    }
  })

  it('places every group in at most one tab, and the tabs only name groups that exist', () => {
    const groups = DOCK_TABS.flatMap((tab) => tab.groups)
    expect(new Set(groups).size).toBe(groups.length)
    const known = new Set(SANDBOX_CATEGORIES.map((c) => c.id))
    expect(groups.filter((g) => !known.has(g))).toEqual([])
  })
})

describe('a manifest from outside the build', () => {
  const mod: ActionManifest = {
    version: 1,
    groups: [{ id: 'mod_storms', label: 'storms', icon: '🌩️' }],
    actions: [
      {
        id: 'mod_firestorm',
        group: 'mod_storms',
        label: 'firestorm',
        icon: '🔥',
        target: 'brush',
        command: { cmd: 'ignite', x: '$x', y: '$y', radius: '$radius' },
        radius: { base: 3, perBrush: 2, max: 12 },
        hotkey: 'g',
      },
      {
        id: 'mod_swap',
        group: 'mod_storms',
        label: 'swap',
        icon: '🌀',
        target: 'pair',
        command: { cmd: 'trade_gift', ax: '$ax', ay: '$ay', bx: '$bx', by: '$by' },
        pair: {
          next: 'model.pair.tradeGift.next',
          done: 'model.pair.tradeGift.done',
          failed: 'model.pair.tradeGift.failed',
        },
      },
    ],
  }

  it('follows the schema, while a broken one does not', () => {
    expect(schemaErrors(schema, mod)).toEqual([])
    const broken = { ...mod, actions: [{ ...mod.actions[0], radius: undefined, target: 'brush' }] }
    expect(schemaErrors(schema, JSON.parse(JSON.stringify(broken))).length).toBeGreaterThan(0)
  })

  it('becomes dock tools that send existing commands, with the radius kept within its limit', () => {
    const registry = buildRegistry(mod)
    const [firestorm] = registry.categories[0].tools
    expect(firestorm.build?.(5, 6, 2)).toEqual({ cmd: 'ignite', x: 5, y: 6, radius: 7 })
    expect(firestorm.build?.(5, 6, 11)).toEqual({ cmd: 'ignite', x: 5, y: 6, radius: 12 })
    expect(registry.pairs.mod_swap.build({ x: 1, y: 2 }, { x: 3, y: 4 })).toEqual({
      cmd: 'trade_gift',
      ax: 1,
      ay: 2,
      bx: 3,
      by: 4,
    })
    expect(hotkeysFor(registry.categories[0].tools)).toEqual(
      new Map([
        ['mod_firestorm', 'G'],
        ['mod_swap', 'Q'],
      ]),
    )
  })

  it('refuses an action in a group it does not define', () => {
    expect(() => buildRegistry({ ...mod, groups: [] })).toThrow(/unknown group/)
  })
})
