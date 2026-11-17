import type { SimEvent, WorldState } from '../../shared/types'
import { HIDDEN_EVENT_TYPES } from '../../shared/constants'
import { activeBattles } from '../render/battles'
import { isNewsEvent } from './news'
import { DAY_TICKS, YEAR_TICKS } from './calendar'

export type FeedTone = 'bad' | 'warn' | 'good' | 'news'

export type FeedItem =
  | { kind: 'peril'; key: string; lineage: string; tribe: string; cause: string }
  | { kind: 'war'; key: string; a: string; b: string; at: Point }
  | { kind: 'season'; key: string; what: 'drought' | 'hardWinter' | 'hardWinterAhead' }
  | { kind: 'event'; key: string; event: SimEvent }

export interface Point {
  x: number
  y: number
}

const EVENT_TONE: Record<string, FeedTone> = {
  died: 'bad',
  disease_death: 'bad',
  murder: 'bad',
  battle: 'bad',
  war_declared: 'bad',
  outbreak: 'bad',
  meteor: 'bad',
  eruption: 'bad',
  building_ruined: 'warn',
  drought: 'warn',
  danger: 'warn',
  theft: 'warn',
  forsaken: 'warn',
  smite: 'warn',
  answered: 'good',
  treaty: 'good',
  era: 'good',
  era_advance: 'good',
  milestone: 'good',
  trade_route: 'good',
}

export function feedTone(item: FeedItem): FeedTone {
  if (item.kind === 'peril' || item.kind === 'war') return 'bad'
  if (item.kind === 'season') return 'warn'
  return EVENT_TONE[item.event.type] ?? 'news'
}

type FeedWorld = Pick<
  WorldState,
  | 'events'
  | 'battles'
  | 'tribes_in_peril'
  | 'tribe_losses'
  | 'lineage_sizes'
  | 'lineage_names'
  | 'drought'
  | 'hard_winter'
  | 'hard_winter_ahead'
>

const MAX_STATE_ITEMS = 3

const RAW_ID = /\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{4,}\b/i
const RAW_POINT = /\(\s*\d+\s*,\s*\d+\s*\)/

export function readsRaw(event: Pick<SimEvent, 'actor' | 'detail'>): boolean {
  const text = `${event.actor ?? ''} ${event.detail ?? ''}`
  return RAW_ID.test(text) || RAW_POINT.test(text)
}

export function worldFeed(world: FeedWorld, limit = 5): FeedItem[] {
  const name = (id: string) => world.lineage_names?.[id] ?? id.slice(0, 6)
  const state: FeedItem[] = []

  for (const p of world.tribes_in_peril ?? []) {
    state.push({
      kind: 'peril',
      key: `peril:${p.lineage_id}`,
      lineage: p.lineage_id,
      tribe: p.tribe || name(p.lineage_id),
      cause: p.cause,
    })
    if (state.length >= 2) break
  }
  const inPeril = new Set((world.tribes_in_peril ?? []).map((p) => p.lineage_id))
  const alive = new Set((world.lineage_sizes ?? []).filter((l) => l.count > 0).map((l) => l.id))
  for (const [lineage, losses] of Object.entries(world.tribe_losses ?? {})) {
    if (state.length >= 2) break
    if (inPeril.has(lineage) || !alive.has(lineage) || !((losses?.starvation ?? 0) > 0)) continue
    state.push({ kind: 'peril', key: `famine:${lineage}`, lineage, tribe: name(lineage), cause: 'hunger' })
  }

  const pairs = new Set<string>()
  for (const b of activeBattles(world.battles)) {
    const a = b.attackers[0]
    const d = b.defenders[0]
    if (!a || !d) continue
    const pair = [a, d].sort().join('|')
    if (pairs.has(pair)) continue
    pairs.add(pair)
    state.push({
      kind: 'war',
      key: `war:${pair}`,
      a: name(a),
      b: name(d),
      at: { x: b.location[0], y: b.location[1] },
    })
    if (pairs.size >= 2) break
  }

  if (world.hard_winter) state.push({ kind: 'season', key: 'hardWinter', what: 'hardWinter' })
  else if (world.hard_winter_ahead)
    state.push({ kind: 'season', key: 'hardWinterAhead', what: 'hardWinterAhead' })
  if (world.drought) state.push({ kind: 'season', key: 'drought', what: 'drought' })

  const out = state.slice(0, Math.min(MAX_STATE_ITEMS, limit))
  const seenTypes = new Set<string>()
  const events = world.events ?? []
  for (let i = events.length - 1; i >= 0 && out.length < limit; i--) {
    const e = events[i]!
    if (HIDDEN_EVENT_TYPES.has(e.type) || !isNewsEvent(e) || readsRaw(e)) continue
    if (seenTypes.has(e.type)) continue
    if (e.type === 'drought' && world.drought) continue
    seenTypes.add(e.type)
    out.push({ kind: 'event', key: `event:${e.tick}:${e.type}:${e.actor}`, event: e })
  }
  return out
}

export type Ago = { unit: 'now' } | { unit: 'days' | 'years'; count: number }

export function agoOf(nowTick: number, tick: number): Ago {
  const ticks = Math.max(0, nowTick - tick)
  if (ticks < DAY_TICKS) return { unit: 'now' }
  if (ticks < YEAR_TICKS) return { unit: 'days', count: Math.floor(ticks / DAY_TICKS) }
  return { unit: 'years', count: Math.floor(ticks / YEAR_TICKS) }
}

export function eventLine(event: Pick<SimEvent, 'actor' | 'detail'>): { lead?: string; text: string } {
  const actor = (event.actor ?? '').trim()
  const detail = (event.detail ?? '').trim()
  if (!actor || /^(the )?world$/i.test(actor)) return { text: detail }
  if (detail.toLowerCase().startsWith(actor.toLowerCase())) {
    return { lead: actor, text: detail.slice(actor.length).trimStart() }
  }
  return { lead: actor, text: detail }
}
