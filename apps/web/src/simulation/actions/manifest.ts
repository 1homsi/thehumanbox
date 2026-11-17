import type { DamageCause } from '../command-outcome'
import type { SandboxViewControl, SkyOverlayKind, TimeControl } from '../sandbox'

export type ActionTarget = 'brush' | 'point' | 'pair' | 'global' | 'random' | 'person' | 'view' | 'time'

export type TemplateValue = string | number | boolean | TemplateValue[] | { [field: string]: TemplateValue }

export type CommandTemplate = { cmd: string } & { [field: string]: TemplateValue }

export interface RadiusRule {
  base: number
  perBrush: number
  min?: number
  max?: number
}

export interface ReachRule {
  min: number
  max: number
  default?: number
  scale?: number
}

export interface CountSlot {
  min: number
  max: number
  default: number
  text?: string
}

export type BrushSize = readonly [size: number, value: number]

export interface BrushSizes {
  sizes: BrushSize[]
  largeSizes?: BrushSize[]
}

export interface PairText {
  next: string
  done: string
  failed: string
}

export interface ActionDef {
  id: string
  group: string
  label: string
  icon: string
  name?: string
  tip?: string
  description?: string
  target: ActionTarget
  command?: CommandTemplate
  radius?: RadiusRule
  reach?: ReachRule
  pair?: PairText
  events?: CommandTemplate[]
  view?: SandboxViewControl
  time?: TimeControl
  overlay?: SkyOverlayKind
  failure?: string
  cause?: DamageCause
  hotkey?: string
  count?: CountSlot
}

export interface GroupDef {
  id: string
  label: string
  icon: string
  name?: string
}

export interface TabDef {
  id: string
  icon: string
  name: string
  tip: string
  groups: string[]
}

export interface ActionManifest {
  id?: string
  name?: string
  author?: string
  description?: string
  version: 1
  brush?: BrushSizes
  tabs?: TabDef[]
  groups: GroupDef[]
  actions: ActionDef[]
}

export type TemplateSlots = Partial<
  Record<'x' | 'y' | 'radius' | 'count' | 'ax' | 'ay' | 'bx' | 'by', number>
>

export function fillTemplate(value: TemplateValue, slots: TemplateSlots): TemplateValue {
  if (typeof value === 'string' && value.startsWith('$')) {
    const slot = slots[value.slice(1) as keyof TemplateSlots]
    if (slot === undefined) throw new Error(`no value for ${value}`)
    return slot
  }
  if (Array.isArray(value)) return value.map((v) => fillTemplate(v, slots))
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fillTemplate(v, slots)]))
  return value
}

export function brushRadius(rule: RadiusRule, brush: number): number {
  const raw = rule.base + rule.perBrush * brush
  return Math.min(rule.max ?? raw, Math.max(rule.min ?? raw, raw))
}

export function clampCount(slot: CountSlot, count: number): number {
  return Math.min(slot.max, Math.max(slot.min, Math.round(count)))
}

export function reachOf(rule: ReachRule | undefined, radius: number): number {
  if (!rule) return radius
  if (rule.default === undefined && !(radius > 0)) return radius
  const clamped = Math.min(rule.max, Math.max(rule.min, radius || (rule.default ?? 0)))
  return rule.scale === undefined ? clamped : Math.round(clamped * rule.scale)
}
