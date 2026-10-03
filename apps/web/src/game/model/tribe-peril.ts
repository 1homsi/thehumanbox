import type { PerilCause, TribePeril, WorldState } from '../../shared/types'

/** What is killing a tribe, and the power that helps most. */
export const PERIL_HELP: Record<PerilCause, { reason: string; tool: string; action: string }> = {
  sickness: { reason: 'sickness is taking them', tool: 'cure', action: 'cure them' },
  hunger: { reason: 'they are starving', tool: 'harvest', action: 'send a harvest' },
  thirst: { reason: 'they have no water', tool: 'rain', action: 'send rain' },
  no_children: { reason: 'no one is left to raise children', tool: 'spawn1', action: 'send a newcomer' },
  old_age: { reason: 'they are growing old', tool: 'spawn1', action: 'send young blood' },
  dwindling: { reason: 'their numbers keep falling', tool: 'bless', action: 'bless them' },
  war: { reason: 'war is killing them', tool: 'peace', action: 'make peace' },
  beasts: { reason: 'beasts are hunting them', tool: 'banish', action: 'drive off the beasts' },
  drowning: { reason: 'the water is taking them', tool: 'grass', action: 'raise dry land' },
  fire: { reason: 'fire is taking them', tool: 'douse', action: 'douse the flames' },
  disaster: { reason: 'disaster after disaster strikes them', tool: 'bless', action: 'bless them' },
}

export function perilOf(world: Pick<WorldState, 'tribes_in_peril'>, lineage: string): TribePeril | null {
  return world.tribes_in_peril?.find((p) => p.lineage_id === lineage) ?? null
}

/** "only 3 left", "the last one" */
export function remainingLine(population: number): string {
  return population === 1 ? 'the last one' : `only ${population} left`
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
const LOSS_WORDS: Record<string, string> = {
  war: 'war',
  combat: 'fights',
  beasts: 'beasts',
  drowning: 'drowning',
  fire: 'fire',
  disaster: 'disaster',
  sickness: 'sickness',
  starvation: 'hunger',
  dehydration: 'thirst',
  old_age: 'old age',
}

/** "3 to war · 1 to old age", worst first; null when nobody died lately. */
export function lossLine(losses: Record<string, number> | undefined): string | null {
  const rows = Object.entries(losses ?? {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  if (rows.length === 0) return null
  return rows
    .slice(0, 3)
    .map(([cause, n]) => `${n} to ${LOSS_WORDS[cause] ?? cause.replace(/_/g, ' ')}`)
    .join(' · ')
}
