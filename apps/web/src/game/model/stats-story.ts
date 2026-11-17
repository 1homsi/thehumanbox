import type { OrganismState, SimEvent, WorldState } from '../../shared/types'
import { activeBattles } from '../render/battles'
import { YEAR_TICKS } from './calendar'

export type Trend = 'up' | 'down' | 'flat'

export interface PopulationStory {
  now: number
  change: number
  span: 'year' | 'start' | null
  trend: Trend
  why: 'food' | 'tightFood' | 'deaths' | 'steady' | 'young'
  cause: string | null
}

type Living = Pick<OrganismState, 'alive' | 'energy'>

export function populationStory(
  world: Pick<WorldState, 'tick' | 'pop_history' | 'tribe_losses'> & { organisms: readonly Living[] },
): PopulationStory {
  const living = world.organisms.filter((o) => o.alive)
  const now = living.length
  const history = world.pop_history ?? []
  if (history.length < 2) {
    return { now, change: 0, span: null, trend: 'flat', why: 'young', cause: null }
  }
  const yearAgo = world.tick - YEAR_TICKS
  let base = history[0]!
  let span: 'year' | 'start' = 'start'
  for (const sample of history) {
    if (sample[0] <= yearAgo) {
      base = sample
      span = 'year'
    } else break
  }
  const change = now - base[1]
  const margin = Math.max(1, base[1] * 0.03)
  const trend: Trend = change > margin ? 'up' : change < -margin ? 'down' : 'flat'
  if (trend === 'up') {
    const hungry = living.filter((o) => o.energy < 0.3).length
    return {
      now,
      change,
      span,
      trend,
      why: now > 0 && hungry / now >= 0.2 ? 'tightFood' : 'food',
      cause: null,
    }
  }
  if (trend === 'down') return { now, change, span, trend, why: 'deaths', cause: topLoss(world.tribe_losses) }
  return { now, change, span, trend, why: 'steady', cause: null }
}

function topLoss(losses: WorldState['tribe_losses']): string | null {
  const totals: Record<string, number> = {}
  for (const byCause of Object.values(losses ?? {})) {
    for (const [cause, n] of Object.entries(byCause ?? {})) totals[cause] = (totals[cause] ?? 0) + n
  }
  const top = Object.entries(totals)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])[0]
  return top ? top[0] : null
}

export interface YearStory {
  born: number
  died: number
  why: 'boom' | 'more' | 'fewer' | 'quiet'
}

export function yearStory(
  history: Pick<WorldState['history'], 'births_by_year' | 'deaths_by_year'>,
): YearStory {
  const born = history.births_by_year?.at(-1) ?? 0
  const died = history.deaths_by_year?.at(-1) ?? 0
  if (born === 0 && died === 0) return { born, died, why: 'quiet' }
  if (born >= Math.max(1, died) * 2) return { born, died, why: 'boom' }
  return { born, died, why: born >= died ? 'more' : 'fewer' }
}

export interface IdeaCount {
  id: string
  people: number
  share: number
}

export function ideasKnown(organisms: readonly Pick<OrganismState, 'alive' | 'discoveries'>[]): IdeaCount[] {
  const living = organisms.filter((o) => o.alive)
  const counts: Record<string, number> = {}
  for (const o of living) for (const d of o.discoveries ?? []) counts[d] = (counts[d] ?? 0) + 1
  return Object.entries(counts)
    .map(([id, people]) => ({ id, people, share: living.length ? people / living.length : 0 }))
    .sort((a, b) => b.people - a.people || a.id.localeCompare(b.id))
}

export interface RelationsStory {
  allies: number
  rivals: number
  wars: number
  mood: 'war' | 'tense' | 'peace' | 'met' | 'alone'
}

export function relationsStory(world: Pick<WorldState, 'tribal_relations' | 'battles'>): RelationsStory {
  let allies = 0
  let rivals = 0
  for (const r of world.tribal_relations ?? []) {
    if (r.status === 'ally') allies++
    else if (r.status === 'rivals') rivals++
  }
  const pairs = new Set<string>()
  for (const b of activeBattles(world.battles)) {
    const a = b.attackers[0]
    const d = b.defenders[0]
    if (a && d) pairs.add([a, d].sort().join('|'))
  }
  const wars = pairs.size
  const known = (world.tribal_relations ?? []).length > 0
  const mood = wars > 0 ? 'war' : rivals > allies ? 'tense' : allies > 0 ? 'peace' : known ? 'met' : 'alone'
  return { allies, rivals, wars, mood }
}

export type TraitLevel = 'veryLow' | 'low' | 'average' | 'high' | 'veryHigh'

export function traitLevel(value: number): TraitLevel {
  if (value < 0.3) return 'veryLow'
  if (value < 0.45) return 'low'
  if (value <= 0.55) return 'average'
  if (value <= 0.7) return 'high'
  return 'veryHigh'
}

const DEATH_CAUSES = [
  ['deaths_old_age', 'oldAge'],
  ['deaths_starvation', 'starvation'],
  ['deaths_dehydration', 'dehydration'],
  ['deaths_sickness', 'sickness'],
  ['deaths_combat', 'combat'],
  ['deaths_beasts', 'beasts'],
  ['deaths_drowning', 'drowned'],
  ['deaths_fire', 'fire'],
  ['deaths_disaster', 'disaster'],
] as const

export type DeathCause = (typeof DEATH_CAUSES)[number][1]

export function deathCauses(
  history: Partial<Record<string, unknown>>,
): { cause: DeathCause; count: number }[] {
  return DEATH_CAUSES.map(([field, cause]) => ({
    cause,
    count: typeof history[field] === 'number' ? (history[field] as number) : 0,
  }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count)
}

export function discoveryMilestones(events: readonly SimEvent[]): SimEvent[] {
  return events
    .filter(
      (e) =>
        e.type === 'build' &&
        (e.detail.includes('mastered') ||
          e.detail.includes('discovered') ||
          e.detail.includes('planted a farm')),
    )
    .slice(-20)
}
