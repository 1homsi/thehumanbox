import type { PrayerInfo } from '../../shared/types'

/** What each prayer asks for, and which tool answers it. */
export const PRAYER_KINDS: Record<string, { plea: string; tool: string; icon: string }> = {
  hunger: { plea: 'pray for food', tool: 'harvest', icon: '🌾' },
  thirst: { plea: 'pray for clean water', tool: 'drink', icon: '💧' },
  sickness: { plea: 'pray for their sick', tool: 'cure', icon: '💊' },
  danger: { plea: 'beg to be saved from beasts', tool: 'banish', icon: '🛡️' },
  rain: { plea: 'pray for rain', tool: 'rain', icon: '🌧️' },
  children: { plea: 'pray for children', tool: 'love', icon: '❤️' },
  peace: { plea: 'pray for the war to end', tool: 'peace', icon: '🕊️' },
  knowledge: { plea: 'pray for wisdom', tool: 'inspire', icon: '💡' },
  shelter: { plea: 'pray for shelter from the cold', tool: 'shelter', icon: '🛖' },
  fire: { plea: 'beg the gods to put out the fire', tool: 'douse', icon: '🪣' },
}

export function prayerTool(kind: string): string | null {
  return PRAYER_KINDS[kind]?.tool ?? null
}

export function prayerPlea(p: Pick<PrayerInfo, 'kind' | 'tribe'>): string {
  const who = p.tribe || 'A tribe'
  return `${who} ${PRAYER_KINDS[p.kind]?.plea ?? 'pray'}`
}

/** Share of the prayer's time still left, 0..1. */
export function prayerTimeLeft(p: Pick<PrayerInfo, 'created' | 'expires'>, tick: number): number {
  const span = Math.max(1, p.expires - p.created)
  return Math.max(0, Math.min(1, (p.expires - tick) / span))
}

/** Prayers one world-wide power answers for everyone at once. */
const GLOBAL_KINDS = new Set(['rain'])

export interface PrayerRow {
  prayer: PrayerInfo
  count: number
}

/**
 * Rows for the prayer list, most urgent first. World-wide needs (rain) are
 * one row however many tribes ask, since one answer covers them all.
 */
export function prayerRows(prayers: readonly PrayerInfo[], tick: number): PrayerRow[] {
  const rows: PrayerRow[] = []
  const grouped = new Map<string, PrayerRow>()
  for (const prayer of sortPrayers(prayers, tick)) {
    if (!GLOBAL_KINDS.has(prayer.kind)) {
      rows.push({ prayer, count: 1 })
      continue
    }
    const row = grouped.get(prayer.kind)
    if (row) row.count += 1
    else {
      const fresh = { prayer, count: 1 }
      grouped.set(prayer.kind, fresh)
      rows.push(fresh)
    }
  }
  return rows
}

export function prayerRowText(row: PrayerRow): string {
  if (row.count <= 1) return prayerPlea(row.prayer)
  return `${row.count} tribes ${PRAYER_KINDS[row.prayer.kind]?.plea ?? 'pray'}`
}

/** Most urgent first: the prayer closest to lapsing. */
export function sortPrayers(prayers: readonly PrayerInfo[], tick: number): PrayerInfo[] {
  return [...prayers].sort((a, b) => prayerTimeLeft(a, tick) - prayerTimeLeft(b, tick) || a.id - b.id)
}
