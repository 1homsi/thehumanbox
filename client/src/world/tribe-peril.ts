import type { PerilCause, TribePeril, WorldState } from '../types'

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
