import { t, type MessageKey } from '../../i18n'
import schema from './action-manifest.schema.json'
import type { ActionDef, ActionManifest, CommandTemplate, GroupDef, TemplateValue } from './manifest'
import { BUILTIN_ACTIONS } from './registry'
import { schemaErrors, type SchemaError } from './schema-check'

export const MOD_LIMITS = {
  bytes: 100_000,
  mods: 12,
  actions: 48,
  groups: 8,
  radius: 48,
  count: 50,
  animals: 12,
  steps: 8,
  number: 10_000,
} as const

type ModTarget = 'brush' | 'point' | 'global'

const SLOTS: Record<ModTarget, readonly string[]> = {
  brush: ['x', 'y', 'radius'],
  point: ['x', 'y'],
  global: [],
}

function isModTarget(target: string): target is ModTarget {
  return target in SLOTS
}

export const MOD_COMMANDS: ReadonlySet<string> = new Set([
  ...BUILTIN_ACTIONS.actions
    .filter((a) => isModTarget(a.target) || a.target === 'random')
    .flatMap((a) => [a.command, ...(a.events ?? [])])
    .flatMap((c) => (c ? [c.cmd] : [])),
  'composite',
])

export type ModPath = (string | number)[]

export interface ModProblem {
  key: MessageKey
  path?: ModPath
  params?: Record<string, string | number>
}

export interface ModInfo {
  id: string
  name: string
  author: string
  description: string
  manifest: ActionManifest
  notes: ModProblem[]
}

export type ModParse = { ok: true; mod: ModInfo } | { ok: false; problems: ModProblem[]; source?: unknown }

const SCHEMA_KEYS: Record<SchemaError['problem'], MessageKey> = {
  type: 'settings.mods.problems.type',
  value: 'settings.mods.problems.value',
  pattern: 'settings.mods.problems.pattern',
  short: 'settings.mods.problems.short',
  long: 'settings.mods.problems.long',
  small: 'settings.mods.problems.small',
  tooFew: 'settings.mods.problems.tooFew',
  tooMany: 'settings.mods.problems.tooMany',
  missing: 'settings.mods.problems.missing',
  unknownField: 'settings.mods.problems.unknownField',
  shape: 'settings.mods.problems.shape',
}

const MAX_PROBLEMS = 8

export function modId(modKey: string, id: string): string {
  return `mod:${modKey}:${id}`
}

function fail(problems: ModProblem[], source?: unknown): ModParse {
  return { ok: false, problems: problems.slice(0, MAX_PROBLEMS), source }
}

function clampCount(cmd: string, value: number): number {
  const most = cmd === 'spawn_animal' ? MOD_LIMITS.animals : MOD_LIMITS.count
  return Math.min(most, Math.max(1, Math.round(value)))
}

interface Checker {
  problems: ModProblem[]
  notes: ModProblem[]
}

function checkValue(
  value: TemplateValue,
  field: string,
  cmd: string,
  slots: readonly string[],
  path: ModPath,
  out: Checker,
): TemplateValue {
  if (typeof value === 'string') {
    if (value.startsWith('$') && !slots.includes(value.slice(1)))
      out.problems.push({ key: 'settings.mods.problems.placeholder', path, params: { slot: value } })
    return value
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Math.abs(value) > MOD_LIMITS.number) {
      out.problems.push({ key: 'settings.mods.problems.number', path, params: { most: MOD_LIMITS.number } })
      return value
    }
    if (field === 'radius' && (value < 0 || value > MOD_LIMITS.radius)) {
      out.notes.push({ key: 'settings.mods.notes.radius', path, params: { most: MOD_LIMITS.radius } })
      return Math.min(MOD_LIMITS.radius, Math.max(0, value))
    }
    if (field === 'count') {
      const kept = clampCount(cmd, value)
      if (kept !== value) out.notes.push({ key: 'settings.mods.notes.count', path, params: { count: kept } })
      return kept
    }
    return value
  }
  if (Array.isArray(value)) return value.map((v, i) => checkValue(v, field, cmd, slots, [...path, i], out))
  if (value && typeof value === 'object') {
    out.problems.push({ key: 'settings.mods.problems.nested', path })
    return value
  }
  return value
}

function checkCommand(
  command: CommandTemplate,
  slots: readonly string[],
  path: ModPath,
  out: Checker,
  inComposite: boolean,
): CommandTemplate {
  const cmd = command.cmd
  if (!MOD_COMMANDS.has(cmd)) {
    out.problems.push({ key: 'settings.mods.problems.command', path, params: { cmd } })
    return command
  }
  if (cmd === 'composite') {
    if (inComposite) {
      out.problems.push({ key: 'settings.mods.problems.compositeInComposite', path })
      return command
    }
    const steps = command.steps
    if (!Array.isArray(steps) || steps.length === 0 || steps.length > MOD_LIMITS.steps) {
      out.problems.push({ key: 'settings.mods.problems.steps', path, params: { most: MOD_LIMITS.steps } })
      return command
    }
    const checked = steps.map((step, i) => {
      if (!step || typeof step !== 'object' || Array.isArray(step) || typeof step.cmd !== 'string') {
        out.problems.push({ key: 'settings.mods.problems.step', path: [...path, 'steps', i] })
        return step
      }
      return checkCommand(step as CommandTemplate, slots, [...path, 'steps', i], out, true)
    })
    return { cmd, steps: checked }
  }
  const fields = Object.entries(command).map(([field, value]) =>
    field === 'cmd' ? [field, value] : [field, checkValue(value, field, cmd, slots, [...path, field], out)],
  )
  return Object.fromEntries(fields) as CommandTemplate
}

function checkAction(action: ActionDef, key: string, path: ModPath, out: Checker): ActionDef | null {
  if (!isModTarget(action.target)) {
    out.problems.push({ key: 'settings.mods.problems.target', path, params: { target: action.target } })
    return null
  }
  if (!action.command) return null
  const command = checkCommand(
    action.command,
    [...SLOTS[action.target], ...(action.count ? ['count'] : [])],
    [...path, 'command'],
    out,
    false,
  )
  const kept: ActionDef = {
    id: modId(key, action.id),
    group: modId(key, action.group),
    label: action.label,
    icon: action.icon,
    target: action.target,
    command,
  }
  if (action.description) kept.description = action.description
  if (action.hotkey) kept.hotkey = action.hotkey
  if (action.count) {
    const max = Math.min(MOD_LIMITS.count, Math.max(1, action.count.max))
    const min = Math.min(max, Math.max(1, action.count.min))
    if (action.count.max > max || action.count.min < min)
      out.notes.push({ key: 'settings.mods.notes.count', path: [...path, 'count'], params: { count: max } })
    kept.count = { min, max, default: Math.min(max, Math.max(min, action.count.default)) }
  }
  if (action.overlay) kept.overlay = action.overlay
  if (action.target === 'brush' && action.radius) {
    const { base, perBrush, min, max } = action.radius
    const capped = Math.min(MOD_LIMITS.radius, max ?? MOD_LIMITS.radius)
    if (base > MOD_LIMITS.radius || (max !== undefined && max > MOD_LIMITS.radius))
      out.notes.push({
        key: 'settings.mods.notes.radius',
        path: [...path, 'radius'],
        params: { most: capped },
      })
    kept.radius = {
      base: Math.min(base, MOD_LIMITS.radius),
      perBrush,
      ...(min !== undefined ? { min: Math.min(min, capped) } : {}),
      max: capped,
    }
  }
  return kept
}

export function parseMod(text: string): ModParse {
  if (text.length > MOD_LIMITS.bytes)
    return fail([
      {
        key: 'settings.mods.problems.tooBig',
        params: { size: Math.ceil(text.length / 1000), most: MOD_LIMITS.bytes / 1000 },
      },
    ])
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (error) {
    return fail([
      {
        key: 'settings.mods.problems.notJson',
        params: { detail: error instanceof Error ? error.message : String(error) },
      },
    ])
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return fail([{ key: 'settings.mods.problems.notManifest' }])
  const found = schemaErrors(schema, value)
  if (found.length)
    return fail(
      found.map((e) => ({ key: SCHEMA_KEYS[e.problem], path: e.path, params: { detail: e.detail } })),
      value,
    )
  const manifest = value as ActionManifest
  const problems: ModProblem[] = []
  if (!manifest.id) problems.push({ key: 'settings.mods.problems.noId' })
  if (!manifest.name) problems.push({ key: 'settings.mods.problems.noName' })
  if (manifest.actions.length === 0) problems.push({ key: 'settings.mods.problems.noActions' })
  if (manifest.actions.length > MOD_LIMITS.actions)
    problems.push({ key: 'settings.mods.problems.tooManyActions', params: { most: MOD_LIMITS.actions } })
  if (manifest.groups.length > MOD_LIMITS.groups)
    problems.push({ key: 'settings.mods.problems.tooManyGroups', params: { most: MOD_LIMITS.groups } })
  if (problems.length) return fail(problems, value)
  const key = manifest.id as string
  const groupIds = new Set<string>()
  const groups: GroupDef[] = []
  manifest.groups.forEach((g, i) => {
    if (groupIds.has(g.id))
      problems.push({ key: 'settings.mods.problems.duplicate', path: ['groups', i], params: { id: g.id } })
    groupIds.add(g.id)
    groups.push({ id: modId(key, g.id), label: g.label, icon: g.icon })
  })
  const out: Checker = { problems, notes: [] }
  const actionIds = new Set<string>()
  const actions: ActionDef[] = []
  manifest.actions.forEach((action, i) => {
    const path: ModPath = ['actions', i]
    if (actionIds.has(action.id))
      problems.push({ key: 'settings.mods.problems.duplicate', path, params: { id: action.id } })
    actionIds.add(action.id)
    if (!groupIds.has(action.group))
      problems.push({ key: 'settings.mods.problems.group', path, params: { group: action.group } })
    const kept = checkAction(action, key, path, out)
    if (kept) actions.push(kept)
  })
  if (problems.length) return fail(problems, value)
  const used = new Set(actions.map((a) => a.group))
  return {
    ok: true,
    mod: {
      id: key,
      name: manifest.name as string,
      author: manifest.author ?? '',
      description: manifest.description ?? '',
      manifest: { version: 1, groups: groups.filter((g) => used.has(g.id)), actions },
      notes: out.notes,
    },
  }
}

export function describeModPath(path: ModPath | undefined, manifest?: unknown): string {
  if (!path || path.length === 0) return t('settings.mods.where.mod')
  const [section, index, ...rest] = path
  const tail = rest.filter((part) => typeof part === 'string').join(' › ')
  let head: string
  if ((section === 'actions' || section === 'groups') && typeof index === 'number') {
    const list = (manifest as Record<string, unknown> | undefined)?.[section]
    const entry = Array.isArray(list) ? (list[index] as Record<string, unknown> | undefined) : undefined
    const label =
      typeof entry?.label === 'string' ? entry.label : typeof entry?.id === 'string' ? entry.id : ''
    head = t(section === 'actions' ? 'settings.mods.where.action' : 'settings.mods.where.group', {
      n: index + 1,
      label,
    })
  } else head = [section, index].filter((p) => p !== undefined).join(' › ')
  return tail ? `${head} › ${tail}` : head
}

export function describeModProblem(problem: ModProblem, manifest?: unknown): string {
  return t(problem.key, { ...problem.params, where: describeModPath(problem.path, manifest) })
}
