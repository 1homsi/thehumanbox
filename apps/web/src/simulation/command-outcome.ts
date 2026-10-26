import { t, type MessageKey } from '../i18n'

/**
 * What a sandbox command did, as the simulation reports it (see
 * crates/sim-core/src/sim/command/outcome.rs). `applied` is whether the world
 * changed; `code` says what happened; `count` and `name` say to whom.
 */
export interface CommandOutcome {
  applied: boolean
  code: string
  count: number
  name: string | null
}

/** The outcome when a command could not be sent or read back. */
export const FAILED_OUTCOME: CommandOutcome = { applied: false, code: 'failed', count: 0, name: null }

/** Reads the JSON the simulation returns for a command; null when it is not an outcome. */
export function parseCommandOutcome(json: string): CommandOutcome | null {
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  if (typeof v.applied !== 'boolean' || typeof v.code !== 'string') return null
  return {
    applied: v.applied,
    code: v.code,
    count: typeof v.count === 'number' && Number.isFinite(v.count) ? v.count : 0,
    name: typeof v.name === 'string' ? v.name : null,
  }
}

/**
 * The sentence for each result code the simulation reports. A code not listed
 * here has no sentence of its own, and the tool keeps its generic line.
 */
const RESULT_KEYS: Record<string, MessageKey | undefined> = {
  none_here: 'header.sandbox.result.none_here',
  none_hurt: 'header.sandbox.result.none_hurt',
  none_sick: 'header.sandbox.result.none_sick',
  none_dead: 'header.sandbox.result.none_dead',
  revive_cooldown: 'header.sandbox.result.revive_cooldown',
  world_full: 'header.sandbox.result.world_full',
  animal_full: 'header.sandbox.result.animal_full',
  no_room_for_animal: 'header.sandbox.result.no_room_for_animal',
  split_small: 'header.sandbox.result.split_small',
  blocked: 'header.sandbox.result.blocked',
  no_government: 'header.sandbox.result.no_government',
  cannot_teach: 'header.sandbox.result.cannot_teach',
  spawned: 'header.sandbox.result.spawned',
  family_arrived: 'header.sandbox.result.family_arrived',
  healed: 'header.sandbox.result.healed',
  healed_animals: 'header.sandbox.result.healed_animals',
  revived: 'header.sandbox.result.revived',
  blessed: 'header.sandbox.result.blessed',
  inspired: 'header.sandbox.result.inspired',
  cured: 'header.sandbox.result.cured',
  cured_tribe: 'header.sandbox.result.cured_tribe',
  loved: 'header.sandbox.result.loved',
  paired: 'header.sandbox.result.paired',
  mutated: 'header.sandbox.result.mutated',
  cursed: 'header.sandbox.result.cursed',
  taught: 'header.sandbox.result.taught',
  moved: 'header.sandbox.result.moved',
  gifted_food: 'header.sandbox.result.gifted_food',
  gifted_tool: 'header.sandbox.result.gifted_tool',
  crowned: 'header.sandbox.result.crowned',
  split: 'header.sandbox.result.split',
  tamed: 'header.sandbox.result.tamed',
  guardian: 'header.sandbox.result.guardian',
  smitten: 'header.sandbox.result.smitten',
  struck_beast: 'header.sandbox.result.struck_beast',
  struck_roof: 'header.sandbox.result.struck_roof',
  animals: 'header.sandbox.result.animals',
}

/** The player-facing sentence for an outcome, or null when its code has none of its own. */
export function describeOutcome(outcome: CommandOutcome): string | null {
  // Own keys only: a code such as "constructor" must not find a property of the object.
  if (!Object.prototype.hasOwnProperty.call(RESULT_KEYS, outcome.code)) return null
  const key = RESULT_KEYS[outcome.code]
  if (!key) return null
  return t(key, { count: outcome.count, name: outcome.name ?? '' })
}
