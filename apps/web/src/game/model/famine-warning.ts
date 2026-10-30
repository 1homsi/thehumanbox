import type { WorldState } from '../../shared/types'

/** A tribe's average food (0..1, as its card's food bar) below this is at risk of famine. */
export const FAMINE_RISK_FOOD = 0.3

/**
 * The stages of a famine, in order: the tribe is at risk (its food is low), it is losing people (hunger has
 * put it on the brink or has killed people lately), or it is gone (its last member starved).
 */
export type FamineStage = 'risk' | 'losing' | 'gone'

const RANK: Record<FamineStage, number> = { risk: 1, losing: 2, gone: 3 }

/** How a tribe's last member died, from its extinction line (the latest one), or undefined when it has none. */
function extinctionCause(
  rows: readonly { tick: number; kind: string; word: string | null }[],
): string | null | undefined {
  let last: { tick: number; kind: string; word: string | null } | null = null
  for (const row of rows) if (row.kind === 'extinct' && (last === null || row.tick >= last.tick)) last = row
  return last?.word
}

/** A warning: a tribe has reached a stage it had not yet been warned about. */
export interface FamineWarning {
  lineage: string
  stage: FamineStage
}

/** The stages already warned about, per tribe, and the world tick of the last look (a lower tick means a new world). */
export interface FamineWatch {
  announced: ReadonlyMap<string, FamineStage>
  worldTick: number
}

type FamineWorld = Pick<
  WorldState,
  'tick' | 'organisms' | 'tribes_in_peril' | 'tribe_losses' | 'tribe_chronicle'
>

/**
 * The famine stage of every tribe that is in one now, computed from the frame alone. A living tribe is at risk
 * when its average food is low, losing people when hunger has it on the brink or its losses include starvation.
 * A tribe that has died out is gone when its last member starved.
 */
export function famineStages(world: Omit<FamineWorld, 'tick'>): Map<string, FamineStage> {
  const energy = new Map<string, { sum: number; count: number }>()
  for (const o of world.organisms) {
    if (o.alive === false) continue
    const e = energy.get(o.lineage_id) ?? { sum: 0, count: 0 }
    e.sum += o.energy
    e.count += 1
    energy.set(o.lineage_id, e)
  }
  const hungry = new Set(
    (world.tribes_in_peril ?? []).filter((p) => p.cause === 'hunger').map((p) => p.lineage_id),
  )
  const stages = new Map<string, FamineStage>()
  for (const [lineage, e] of energy) {
    const losing = hungry.has(lineage) || (world.tribe_losses?.[lineage]?.starvation ?? 0) > 0
    if (losing) stages.set(lineage, 'losing')
    else if (e.sum / e.count < FAMINE_RISK_FOOD) stages.set(lineage, 'risk')
  }
  for (const [lineage, rows] of Object.entries(world.tribe_chronicle ?? {})) {
    if (energy.has(lineage)) continue
    if (extinctionCause(rows) === 'starvation') stages.set(lineage, 'gone')
  }
  return stages
}

/**
 * The warnings due since the last look. The first look, and any look after the world went back in time (a
 * loaded save), only learns the state: loading a game never warns about what was already true. A tribe is
 * warned once per stage it reaches, and again if it recovers and falls back into a stage.
 */
export function watchFamine(
  watch: FamineWatch | null,
  world: FamineWorld,
): { warnings: FamineWarning[]; watch: FamineWatch; stages: Map<string, FamineStage> } {
  const stages = famineStages(world)
  if (!watch || world.tick < watch.worldTick) {
    return { warnings: [], watch: { announced: new Map(stages), worldTick: world.tick }, stages }
  }
  const announced = new Map(watch.announced)
  const warnings: FamineWarning[] = []
  for (const [lineage, stage] of stages) {
    const before = announced.get(lineage)
    if (!before || RANK[stage] > RANK[before]) {
      warnings.push({ lineage, stage })
      announced.set(lineage, stage)
    }
  }
  // A tribe that has recovered may be warned again later. A tribe that is gone stays warned.
  for (const lineage of [...announced.keys()]) {
    if (!stages.has(lineage)) announced.delete(lineage)
  }
  return { warnings, watch: { announced, worldTick: world.tick }, stages }
}
