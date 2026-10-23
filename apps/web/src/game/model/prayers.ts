import type { PrayerInfo } from '../../shared/types'
import { t, type MessageKey } from '../../i18n'

/** What each prayer asks for, and which tool answers it. The plea is a key, read with t() where it is shown. */
export const PRAYER_KINDS: Record<string, { plea: MessageKey; tool: string; icon: string }> = {
  hunger: { plea: 'model.prayers.plea.hunger', tool: 'harvest', icon: '🌾' },
  thirst: { plea: 'model.prayers.plea.thirst', tool: 'drink', icon: '💧' },
  sickness: { plea: 'model.prayers.plea.sickness', tool: 'cure', icon: '💊' },
  danger: { plea: 'model.prayers.plea.danger', tool: 'banish', icon: '🛡️' },
  rain: { plea: 'model.prayers.plea.rain', tool: 'rain', icon: '🌧️' },
  children: { plea: 'model.prayers.plea.children', tool: 'love', icon: '❤️' },
  peace: { plea: 'model.prayers.plea.peace', tool: 'peace', icon: '🕊️' },
  knowledge: { plea: 'model.prayers.plea.knowledge', tool: 'inspire', icon: '💡' },
  shelter: { plea: 'model.prayers.plea.shelter', tool: 'shelter', icon: '🛖' },
  fire: { plea: 'model.prayers.plea.fire', tool: 'douse', icon: '🪣' },
}

export function prayerTool(kind: string): string | null {
  return PRAYER_KINDS[kind]?.tool ?? null
}

/** What a prayer of this kind asks for, in words ("pray for food"), or null for an unknown kind. */
export function prayerPleaText(kind: string): string | null {
  const key = PRAYER_KINDS[kind]?.plea
  return key ? t(key) : null
}

export function prayerPlea(p: Pick<PrayerInfo, 'kind' | 'tribe'>): string {
  const who = p.tribe || t('model.prayers.aTribe')
  return t('model.prayers.sentence', { who, plea: prayerPleaText(p.kind) ?? t('model.prayers.pray') })
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
  return t('model.prayers.many', {
    count: row.count,
    plea: prayerPleaText(row.prayer.kind) ?? t('model.prayers.pray'),
  })
}

/** Most urgent first: the prayer closest to lapsing. */
export function sortPrayers(prayers: readonly PrayerInfo[], tick: number): PrayerInfo[] {
  return [...prayers].sort((a, b) => prayerTimeLeft(a, tick) - prayerTimeLeft(b, tick) || a.id - b.id)
}
