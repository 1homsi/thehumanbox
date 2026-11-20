import type { PerilCause, TribePeril } from '../../shared/types'
import { FAMINE_RISK_FOOD } from './famine-warning'
import { DAY_TICKS } from './calendar'

export type UrgencyKind = 'famine' | 'thirst' | 'war' | 'plague' | 'danger'

export interface TribeUrgency {
  kind: UrgencyKind
  lost: number
  alive: number
  total: number
  level: number
}

export const HARM_SHARE = 0.1
export const HARM_MIN = 2
export const RED_SHARE = 0.4
export const HOLD_TICKS = DAY_TICKS

const CAUSE_KIND: Record<string, UrgencyKind> = {
  starvation: 'famine',
  dehydration: 'thirst',
  war: 'war',
  combat: 'war',
  sickness: 'plague',
}

const PERIL_KIND: Partial<Record<PerilCause, UrgencyKind>> = {
  hunger: 'famine',
  thirst: 'thirst',
  war: 'war',
  sickness: 'plague',
}

export interface UrgencyInput {
  peril: Pick<TribePeril, 'cause'> | null
  losses: Record<string, number> | undefined
  alive: number
  food: number
}

export function tribeUrgency({ peril, losses, alive, food }: UrgencyInput): TribeUrgency | null {
  const rows = Object.entries(losses ?? {}).filter(([, n]) => n > 0)
  const lost = rows.reduce((sum, [, n]) => sum + n, 0)
  const harm = rows.filter(([cause]) => cause !== 'old_age').reduce((sum, [, n]) => sum + n, 0)
  const total = alive + lost
  const starving = (losses?.starvation ?? 0) > 0 || food < FAMINE_RISK_FOOD
  const heavyLosses = harm >= HARM_MIN && harm >= total * HARM_SHARE
  if (!peril && !starving && !heavyLosses) return null
  const worst = rows
    .filter(([cause]) => cause !== 'old_age')
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]
  const kind =
    (peril && PERIL_KIND[peril.cause]) ??
    (starving ? 'famine' : undefined) ??
    (worst && CAUSE_KIND[worst[0]]) ??
    'danger'
  const level = total > 0 ? Math.min(1, lost / total / RED_SHARE) : 0
  return { kind, lost, alive, total, level }
}

export interface HeldUrgency {
  urgency: TribeUrgency
  seen: number
}

export function holdUrgency(
  held: HeldUrgency | null,
  now: TribeUrgency | null,
  tick: number,
): HeldUrgency | null {
  if (now) return { urgency: now, seen: tick }
  if (!held || tick < held.seen || tick - held.seen > HOLD_TICKS) return null
  return held
}

export interface LossSample {
  tick: number
  lost: number
}

export type LossTrend = 'rising' | 'easing' | 'flat'

export function recordLoss(samples: readonly LossSample[], tick: number, lost: number): LossSample[] {
  const last = samples[samples.length - 1]
  if (last && tick < last.tick) return [{ tick, lost }]
  const kept = samples.filter((s) => tick - s.tick <= HOLD_TICKS)
  if (last && last.tick === tick) kept.pop()
  return [...kept, { tick, lost }]
}

export function lossTrend(samples: readonly LossSample[]): LossTrend {
  if (samples.length < 2) return 'flat'
  const first = samples[0]!.lost
  const last = samples[samples.length - 1]!.lost
  return last > first ? 'rising' : last < first ? 'easing' : 'flat'
}

export function urgencyColor(level: number): string {
  const k = Math.max(0, Math.min(1, level))
  const from = [0xe0, 0xa0, 0x30]
  const to = [0xd0, 0x30, 0x2a]
  const mix = from.map((c, i) => Math.round(c + (to[i]! - c) * k))
  return `rgb(${mix.join(', ')})`
}
