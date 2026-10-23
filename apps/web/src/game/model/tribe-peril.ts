import type { PerilCause, TribePeril, WorldState } from '../../shared/types'
import { t, type MessageKey } from '../../i18n'

/** What is killing a tribe, and the power that helps most. The text is a key, read with t() where it is shown. */
export const PERIL_HELP: Record<PerilCause, { reason: MessageKey; tool: string; action: MessageKey }> = {
  sickness: { reason: 'model.peril.sickness.reason', tool: 'cure', action: 'model.peril.sickness.action' },
  hunger: { reason: 'model.peril.hunger.reason', tool: 'harvest', action: 'model.peril.hunger.action' },
  thirst: { reason: 'model.peril.thirst.reason', tool: 'rain', action: 'model.peril.thirst.action' },
  no_children: {
    reason: 'model.peril.noChildren.reason',
    tool: 'spawn1',
    action: 'model.peril.noChildren.action',
  },
  old_age: { reason: 'model.peril.oldAge.reason', tool: 'spawn1', action: 'model.peril.oldAge.action' },
  dwindling: {
    reason: 'model.peril.dwindling.reason',
    tool: 'bless',
    action: 'model.peril.dwindling.action',
  },
  war: { reason: 'model.peril.war.reason', tool: 'peace', action: 'model.peril.war.action' },
  beasts: { reason: 'model.peril.beasts.reason', tool: 'banish', action: 'model.peril.beasts.action' },
  drowning: { reason: 'model.peril.drowning.reason', tool: 'grass', action: 'model.peril.drowning.action' },
  fire: { reason: 'model.peril.fire.reason', tool: 'douse', action: 'model.peril.fire.action' },
  disaster: { reason: 'model.peril.disaster.reason', tool: 'bless', action: 'model.peril.disaster.action' },
}

export function perilOf(world: Pick<WorldState, 'tribes_in_peril'>, lineage: string): TribePeril | null {
  return world.tribes_in_peril?.find((p) => p.lineage_id === lineage) ?? null
}

/** "only 3 left", "the last one" */
export function remainingLine(population: number): string {
  return population === 1 ? t('model.peril.lastOne') : t('model.peril.left', { count: population })
}

/** Rows to show in the panel: every tribe on the brink, then the largest. */
export function visibleLineages<T extends { count: number; peril?: unknown }>(
  rows: readonly T[],
  limit = 5,
): T[] {
  const sorted = [...rows].sort(
    (a, b) => Number(!!b.peril) - Number(!!a.peril) || (a.peril ? a.count - b.count : b.count - a.count),
  )
  const endangered = sorted.filter((r) => r.peril).length
  return sorted.slice(0, Math.max(limit, endangered))
}

/** Where a tribe lives: its settlement, or the middle of its people. */
export function tribeHome(
  world: Pick<WorldState, 'settlements' | 'organisms'>,
  lineage: string,
): { x: number; y: number } | null {
  const home = world.settlements?.find((s) => s.lineage_id === lineage)
  if (home) return { x: home.center[0], y: home.center[1] }
  const people = world.organisms.filter((o) => o.alive !== false && o.lineage_id === lineage)
  if (people.length === 0) return null
  return {
    x: people.reduce((n, o) => n + o.x, 0) / people.length,
    y: people.reduce((n, o) => n + o.y, 0) / people.length,
  }
}

/** How each cause of death reads on a tribe card. */
const LOSS_WORDS: Record<string, MessageKey> = {
  war: 'model.loss.war',
  combat: 'model.loss.fights',
  beasts: 'model.loss.beasts',
  drowning: 'model.loss.drowning',
  fire: 'model.loss.fire',
  disaster: 'model.loss.disaster',
  sickness: 'model.loss.sickness',
  starvation: 'model.loss.hunger',
  dehydration: 'model.loss.thirst',
  old_age: 'model.loss.oldAge',
}

/** "3 to war · 1 to old age", worst first; null when nobody died lately. */
export function lossLine(losses: Record<string, number> | undefined): string | null {
  const rows = Object.entries(losses ?? {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  if (rows.length === 0) return null
  return rows
    .slice(0, 3)
    .map(([cause, n]) => {
      const key = LOSS_WORDS[cause]
      const word = key ? t(key) : cause.replace(/_/g, ' ')
      return t('model.loss.to', { count: n, cause: word })
    })
    .join(' · ')
}
