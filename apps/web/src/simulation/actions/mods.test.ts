import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DOCK_TABS, groupsFor } from '../../ui/toolbar/dock-tabs'
import { toolReach } from '../../ui/toolbar/tool-tips'
import { SANDBOX_CATEGORIES, commandReach, toolById } from '../sandbox'
import { MOD_STORAGE_KEY, useMods } from './mod-store'
import { MOD_COMMANDS, MOD_LIMITS, describeModProblem, parseMod } from './mods'
import { MOD_TAB_ID } from './registry'

const SAMPLE = readFileSync(new URL('../../../public/mods/example-firestorm.json', import.meta.url), 'utf8')

const RUST_REGISTRY = readFileSync(
  new URL('../../../../../crates/sim-core/src/sim/command/registry.rs', import.meta.url),
  'utf8',
)

function mod(actions: unknown[], extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    version: 1,
    id: 'test',
    name: 'Test',
    groups: [{ id: 'g', label: 'g', icon: '🔥' }],
    actions,
    ...extra,
  })
}

const brush = (command: unknown, radius: unknown = { base: 2, perBrush: 1 }) => ({
  id: 'a',
  group: 'g',
  label: 'a',
  icon: '🔥',
  target: 'brush',
  command,
  radius,
})

function problems(text: string): string[] {
  const parsed = parseMod(text)
  if (parsed.ok) return []
  return parsed.problems.map((p) => p.key)
}

const stored = new Map<string, string>()

beforeEach(() => {
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => void stored.set(key, value),
      removeItem: (key: string) => void stored.delete(key),
    },
  })
})

afterEach(() => {
  for (const entry of useMods.getState().mods) useMods.getState().remove(entry.mod?.id ?? entry.raw)
  stored.delete(MOD_STORAGE_KEY)
  vi.unstubAllGlobals()
})

describe('reading a mod', () => {
  it('accepts the example mod and namespaces its ids', () => {
    const parsed = parseMod(SAMPLE)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.mod.name).toBe('Firestorm')
    expect(parsed.mod.manifest.actions.map((a) => a.id)).toEqual([
      'mod:firestorm:firestorm',
      'mod:firestorm:frog_rain',
      'mod:firestorm:grove',
    ])
    expect(parsed.mod.manifest.groups.map((g) => g.id)).toEqual(['mod:firestorm:storms'])
    expect(parsed.mod.notes).toEqual([])
  })

  it('only lets a mod send commands the simulation registers', () => {
    const registered = new Set([
      ...[...RUST_REGISTRY.matchAll(/^\s*"(\w+)" =>/gm)].map((m) => m[1]),
      ...[...RUST_REGISTRY.matchAll(/\("(\w+)", "\w+"\)/g)].map((m) => m[1]),
    ])
    expect(registered.has('time_of_day')).toBe(true)
    expect([...MOD_COMMANDS].filter((cmd) => !registered.has(cmd))).toEqual([])
    expect(MOD_COMMANDS.has('set_difficulty')).toBe(false)
    expect(MOD_COMMANDS.has('rename_person')).toBe(false)
  })

  it('refuses text that is not JSON, not an object, or too big', () => {
    expect(problems('{ nope')).toEqual(['settings.mods.problems.notJson'])
    expect(problems('[1, 2]')).toEqual(['settings.mods.problems.notManifest'])
    expect(problems(' '.repeat(MOD_LIMITS.bytes + 1))).toEqual(['settings.mods.problems.tooBig'])
  })

  it('explains schema problems in words, naming the power they are in', () => {
    const parsed = parseMod(mod([{ ...brush({ cmd: 'ignite', x: '$x', y: '$y' }), radius: undefined }]))
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    const text = parsed.problems.map((p) => describeModProblem(p, parsed.source))
    expect(text.join('\n')).toMatch(/Power 1 \(a\).*missing “radius”/)
  })

  it('needs an id and a name', () => {
    expect(problems(mod([brush({ cmd: 'ignite' })], { id: undefined, name: undefined }))).toEqual([
      'settings.mods.problems.noId',
      'settings.mods.problems.noName',
    ])
  })

  it('refuses unknown commands, nested composites, too many steps and wrong placeholders', () => {
    expect(problems(mod([brush({ cmd: 'delete_world' })]))).toEqual(['settings.mods.problems.command'])
    expect(problems(mod([brush({ cmd: 'set_difficulty', level: 'calm' })]))).toEqual([
      'settings.mods.problems.command',
    ])
    const step = { cmd: 'gale' }
    expect(
      problems(mod([brush({ cmd: 'composite', steps: [{ cmd: 'composite', steps: [step] }] })])),
    ).toEqual(['settings.mods.problems.compositeInComposite'])
    expect(
      problems(mod([brush({ cmd: 'composite', steps: Array(MOD_LIMITS.steps + 1).fill(step) })])),
    ).toEqual(['settings.mods.problems.steps'])
    const global = { id: 'w', group: 'g', label: 'w', icon: '🔥', target: 'global' }
    expect(problems(mod([{ ...global, command: { cmd: 'meteor', x: '$x', y: 1 } }]))).toEqual([
      'settings.mods.problems.placeholder',
    ])
  })

  it('refuses powers that are not brush, click or world-wide', () => {
    const view = {
      id: 'v',
      group: 'g',
      label: 'v',
      icon: '🔥',
      target: 'view',
      view: { control: 'flag', value: 'grid' },
    }
    expect(problems(mod([view]))).toEqual(['settings.mods.problems.target'])
  })

  it('refuses duplicate ids and actions in a group it does not list', () => {
    const a = brush({ cmd: 'ignite', x: '$x', y: '$y', radius: '$radius' })
    expect(problems(mod([a, a]))).toEqual(['settings.mods.problems.duplicate'])
    expect(problems(mod([{ ...a, group: 'other' }]))).toEqual(['settings.mods.problems.group'])
  })

  it('keeps radius and counts within what the simulation allows, and says so', () => {
    const parsed = parseMod(
      mod([
        brush(
          {
            cmd: 'composite',
            steps: [
              { cmd: 'spawn_animal', x: '$x', y: '$y', kind: 'wolf', count: 99, radius: 500 },
              { cmd: 'spawn', x: '$x', y: '$y', count: 0 },
            ],
          },
          { base: 900, perBrush: 4, max: 4000 },
        ),
      ]),
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const [action] = parsed.mod.manifest.actions
    expect(action.radius).toEqual({ base: MOD_LIMITS.radius, perBrush: 4, max: MOD_LIMITS.radius })
    expect(action.command).toEqual({
      cmd: 'composite',
      steps: [
        {
          cmd: 'spawn_animal',
          x: '$x',
          y: '$y',
          kind: 'wolf',
          count: MOD_LIMITS.animals,
          radius: MOD_LIMITS.radius,
        },
        { cmd: 'spawn', x: '$x', y: '$y', count: 1 },
      ],
    })
    expect(parsed.mod.notes.map((n) => n.key)).toEqual([
      'settings.mods.notes.count',
      'settings.mods.notes.radius',
      'settings.mods.notes.count',
      'settings.mods.notes.radius',
    ])
  })

  it('drops built-in text keys, reach rules and damage causes a mod brings', () => {
    const parsed = parseMod(
      mod([
        {
          ...brush({ cmd: 'nuke', x: '$x', y: '$y', radius: '$radius' }),
          name: 'dock.tools.nuke',
          tip: 'dock.tips.nuke',
          reach: { min: 0, max: 999 },
          cause: 'flood',
        },
      ]),
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const [action] = parsed.mod.manifest.actions
    expect(action.name).toBeUndefined()
    expect(action.tip).toBeUndefined()
    expect(action.reach).toBeUndefined()
    expect(action.cause).toBeUndefined()
  })
})

describe('installed mods', () => {
  it('get a mods tab of their own, and leave the built-in dock as it was', () => {
    const builtInTabs = DOCK_TABS.map((t) => t.id)
    const builtInGroups = SANDBOX_CATEGORIES.length
    const result = useMods.getState().install(SAMPLE)
    expect(result.ok).toBe(true)
    expect(DOCK_TABS.map((t) => t.id)).toEqual([...builtInTabs, MOD_TAB_ID])
    expect(groupsFor(MOD_TAB_ID).map((g) => g.label)).toEqual(['storms'])
    expect(SANDBOX_CATEGORIES).toHaveLength(builtInGroups + 1)
    const firestorm = toolById('mod:firestorm:firestorm')
    expect(firestorm?.build?.(10, 20, 2)).toEqual({
      cmd: 'composite',
      steps: [
        { cmd: 'ignite', x: 10, y: 20, radius: 5 },
        { cmd: 'thunder', x: 10, y: 20, radius: 5 },
        { cmd: 'gale' },
      ],
    })
    expect(firestorm?.description).toMatch(/ablaze/)
    expect(toolReach(firestorm!, 2)).toMatch(/5/)
    useMods.getState().setEnabled('firestorm', false)
    expect(DOCK_TABS.map((t) => t.id)).toEqual(builtInTabs)
    expect(toolById('mod:firestorm:firestorm')).toBeUndefined()
    useMods.getState().setEnabled('firestorm', true)
    useMods.getState().remove('firestorm')
    expect(DOCK_TABS.map((t) => t.id)).toEqual(builtInTabs)
    expect(SANDBOX_CATEGORIES).toHaveLength(builtInGroups)
  })

  it('come back from browser storage on load, enabled or not', () => {
    useMods.getState().install(SAMPLE)
    useMods.getState().setEnabled('firestorm', false)
    useMods.setState({ mods: [] })
    useMods.getState().reload()
    expect(useMods.getState().mods.map((m) => [m.mod?.id, m.enabled])).toEqual([['firestorm', false]])
    useMods.getState().setEnabled('firestorm', true)
    useMods.setState({ mods: [] })
    useMods.getState().reload()
    expect(toolById('mod:firestorm:grove')).toBeDefined()
  })

  it('replace an installed mod with the same id instead of adding a second', () => {
    useMods.getState().install(SAMPLE)
    const again = useMods.getState().install(SAMPLE)
    expect(again.ok && again.replaced).toBe(true)
    expect(useMods.getState().mods).toHaveLength(1)
  })

  it('keep a stored mod that no longer passes the checks, switched off', () => {
    window.localStorage.setItem(
      MOD_STORAGE_KEY,
      JSON.stringify([{ raw: mod([brush({ cmd: 'nope' })]), enabled: true }]),
    )
    useMods.getState().reload()
    const [entry] = useMods.getState().mods
    expect(entry.mod).toBeNull()
    expect(entry.enabled).toBe(false)
    expect(entry.problems.map((p) => p.key)).toEqual(['settings.mods.problems.command'])
  })
})

describe('the preview of a combined power', () => {
  it('reaches as far as its widest step', () => {
    expect(
      commandReach({
        cmd: 'composite',
        steps: [
          { cmd: 'nuke', x: 0, y: 0, radius: 16 },
          { cmd: 'ignite', x: 0, y: 0, radius: 3 },
        ],
      }),
    ).toBe(22)
  })
})
