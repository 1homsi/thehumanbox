import type { WorldState } from '../../shared/types'
import { enemiesOf } from '../render/battles'
import type { TribeStatus } from './tribe-status'

/**
 * Why a tribe does what it does, read off what the simulation already sends. The sim keeps no single
 * "most pressing need" number, so the shortfalls here are derived from the same figures the card's bars
 * and the map show. The thresholds are the card's own: a bar under 45% is low.
 */

export const NEEDS = ['food', 'water', 'health', 'shelter', 'safety', 'land'] as const
export type Need = (typeof NEEDS)[number]
export type Shortfalls = Record<Need, number>

/** A shortfall at or past this reads as pressing: the same line the card marks a bar low (under 45%). */
export const PRESSING = 0.55

/** Causes of a tribe's decline that are violence, not want. */
const VIOLENT_CAUSES = new Set(['war', 'beasts', 'fire', 'drowning'])
/** Safety short of this much when the tribe is at war with a neighbour or a violent death is taking it. */
const WAR_SAFETY = 0.8
const VIOLENCE_SAFETY = 0.7

const clamp = (v: number) => Math.min(1, Math.max(0, v))

/**
 * How short of each need a tribe is, 0 (met) to 1 (desperate):
 * - food, water, health: the average of its living people, as the bars show them.
 * - shelter: people past the room its buildings hold (settlement population over capacity).
 * - safety: the fear its people feel, or war and violent losses if that is worse.
 * - land: the share of its claimed ground that is contested by another tribe.
 */
export function shortfalls(world: WorldState, status: TribeStatus): Shortfalls {
  const id = status.id
  let people = 0
  let room = 0
  for (const s of world.settlements ?? []) {
    if (s.lineage_id !== id) continue
    people += s.population
    room += s.capacity
  }
  const shelter = people > room ? (people - room) / people : 0

  const members = world.organisms.filter((o) => o.alive && o.lineage_id === id)
  const fear = members.length ? members.reduce((sum, o) => sum + (o.fear_level ?? 0), 0) / members.length : 0
  const cause = world.tribes_in_peril?.find((p) => p.lineage_id === id)?.cause
  const atWar = enemiesOf(world.battles, id).length > 0
  const safety = Math.max(
    clamp(fear),
    atWar ? WAR_SAFETY : 0,
    cause && VIOLENT_CAUSES.has(cause) ? VIOLENCE_SAFETY : 0,
  )

  const tiles = world.territory?.claimed.find((c) => c.lid === id)?.tiles ?? []
  const contested = new Set((world.territory?.contested ?? []).map(([x, y]) => `${x},${y}`))
  const contestedOwn = tiles.filter(([x, y]) => contested.has(`${x},${y}`)).length
  const land = tiles.length ? contestedOwn / tiles.length : 0

  return {
    food: clamp(1 - status.food),
    water: clamp(1 - status.water),
    health: clamp(1 - status.health),
    shelter: clamp(shelter),
    safety,
    land: clamp(land),
  }
}

/** The need most short of, if any is at or past the pressing line. Ties go to the earlier need in NEEDS. */
export function pressingNeed(short: Shortfalls): { need: Need; short: number } | null {
  let best: { need: Need; short: number } | null = null
  for (const need of NEEDS) {
    const s = short[need]
    if (s >= PRESSING && (!best || s > best.short)) best = { need, short: s }
  }
  return best
}

export type Objective =
  { kind: 'guided'; strategy: string; progress: number; target: number } | { kind: 'unguided' }

/** The campaign the player has guided this tribe to, while it is still running. */
export function objectiveOf(world: WorldState, id: string): Objective {
  const s = world.lineage_strategies?.[id]
  // A campaign that has already been reached is no longer an objective, even before its deadline.
  if (!s || s.expires_tick <= world.tick || s.status === 'completed' || s.completed)
    return { kind: 'unguided' }
  return { kind: 'guided', strategy: s.strategy, progress: s.progress ?? 0, target: s.target ?? 0 }
}

export interface Work {
  skill: string
  count: number
}

/** What the tribe's people are at work on, most people first. */
export function workOf(world: WorldState, id: string): Work[] {
  return Object.entries(world.tribe_work?.[id] ?? {})
    .filter(([, count]) => count > 0)
    .map(([skill, count]) => ({ skill, count }))
    .sort((a, b) => b.count - a.count || a.skill.localeCompare(b.skill))
}

export interface Stance {
  allied: string[]
  neutral: string[]
  rivals: string[]
}

/** The tribes this one stands with, stands neutral to, or is at odds with, from the attitudes between them. */
export function stanceOf(world: WorldState, id: string): Stance {
  const name = (lid: string) => world.lineage_names?.[lid] ?? lid.slice(0, 6)
  const out: Stance = { allied: [], neutral: [], rivals: [] }
  for (const r of world.tribal_relations ?? []) {
    const other = r.a === id ? r.b : r.b === id ? r.a : null
    if (other === null) continue
    if (r.status === 'ally') out.allied.push(name(other))
    else if (r.status === 'rivals') out.rivals.push(name(other))
    else out.neutral.push(name(other))
  }
  out.allied.sort()
  out.neutral.sort()
  out.rivals.sort()
  return out
}

export type NextStep =
  | { kind: 'need'; need: Need }
  | { kind: 'campaign'; strategy: string }
  | { kind: 'learn'; secret: string }
  | { kind: 'carryOn' }

/**
 * What the tribe is about to try. Survival comes first: a pressing need wins over a campaign. Then the
 * campaign it was guided to, then the next secret it lacks for its next age.
 */
export function nextStep(
  pressing: { need: Need } | null,
  objective: Objective,
  nextAge: TribeStatus['nextAge'],
): NextStep {
  if (pressing) return { kind: 'need', need: pressing.need }
  if (objective.kind === 'guided') return { kind: 'campaign', strategy: objective.strategy }
  const secret = nextAge?.missing[0]
  if (secret) return { kind: 'learn', secret }
  return { kind: 'carryOn' }
}

export interface TribeReasoning {
  objective: Objective
  shortfalls: Shortfalls
  pressing: { need: Need; short: number } | null
  work: Work[]
  stance: Stance
  next: NextStep
}

/** Everything the tribe card says about why a tribe acts. */
export function tribeReasoning(world: WorldState, status: TribeStatus): TribeReasoning {
  const short = shortfalls(world, status)
  const pressing = pressingNeed(short)
  const objective = objectiveOf(world, status.id)
  return {
    objective,
    shortfalls: short,
    pressing,
    work: workOf(world, status.id),
    stance: stanceOf(world, status.id),
    next: nextStep(pressing, objective, status.nextAge),
  }
}
