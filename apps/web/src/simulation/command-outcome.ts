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
  /** Buildings a disaster damaged or destroyed besides the people it hit; absent when none. */
  buildings?: number
  tribe?: string
  homes?: boolean
  cause?: DamageCause
}

export type DamageCause =
  | 'flood'
  | 'tsunami'
  | 'earthquake'
  | 'meteor'
  | 'fire'
  | 'storm'
  | 'lightning'
  | 'volcano'
  | 'frost'
  | 'sinkhole'
  | 'blackHole'
  | 'acid'
  | 'nuke'
  | 'disaster'

const CAUSE_OF_COMMAND: Record<string, DamageCause> = {
  flood: 'flood',
  tsunami: 'tsunami',
  earthquake: 'earthquake',
  meteor: 'meteor',
  meteor_shower: 'meteor',
  ignite: 'fire',
  wildfire: 'fire',
  tornado: 'storm',
  hail: 'storm',
  smite: 'lightning',
  thunder: 'lightning',
  volcano: 'volcano',
  blizzard: 'frost',
  freeze: 'frost',
  sinkhole: 'sinkhole',
  black_hole: 'blackHole',
  acid_rain: 'acid',
  nuke: 'nuke',
}

export function damageCauseOf(cmd: string): DamageCause {
  return Object.prototype.hasOwnProperty.call(CAUSE_OF_COMMAND, cmd) ? CAUSE_OF_COMMAND[cmd] : 'disaster'
}

const CAUSE_KEYS: Record<DamageCause, MessageKey> = {
  flood: 'header.sandbox.damage.cause.flood',
  tsunami: 'header.sandbox.damage.cause.tsunami',
  earthquake: 'header.sandbox.damage.cause.earthquake',
  meteor: 'header.sandbox.damage.cause.meteor',
  fire: 'header.sandbox.damage.cause.fire',
  storm: 'header.sandbox.damage.cause.storm',
  lightning: 'header.sandbox.damage.cause.lightning',
  volcano: 'header.sandbox.damage.cause.volcano',
  frost: 'header.sandbox.damage.cause.frost',
  sinkhole: 'header.sandbox.damage.cause.sinkhole',
  blackHole: 'header.sandbox.damage.cause.blackHole',
  acid: 'header.sandbox.damage.cause.acid',
  nuke: 'header.sandbox.damage.cause.nuke',
  disaster: 'header.sandbox.damage.cause.disaster',
}

export function describeDamage(outcome: CommandOutcome): string | null {
  const count = outcome.buildings ?? (outcome.code === 'disaster_buildings' ? outcome.count : 0)
  if (!(count > 0)) return null
  const cause = t(CAUSE_KEYS[outcome.cause ?? 'disaster'])
  const tribe = outcome.tribe ?? ''
  const key: MessageKey = tribe
    ? outcome.homes
      ? 'header.sandbox.damage.tribeHomes'
      : 'header.sandbox.damage.tribeBuildings'
    : outcome.homes
      ? 'header.sandbox.damage.homes'
      : 'header.sandbox.damage.buildings'
  return t(key, { count, cause, tribe })
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
    ...(typeof v.buildings === 'number' && Number.isFinite(v.buildings) && v.buildings > 0
      ? { buildings: v.buildings }
      : {}),
    ...(typeof v.tribe === 'string' && v.tribe ? { tribe: v.tribe } : {}),
    ...(v.homes === true ? { homes: true } : {}),
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
  disaster_killed: 'header.sandbox.result.disaster_killed',
  disaster_hurt: 'header.sandbox.result.disaster_hurt',
  disaster_sick: 'header.sandbox.result.disaster_sick',
  disaster_food: 'header.sandbox.result.disaster_food',
  disaster_buildings: 'header.sandbox.result.disaster_buildings',
  disaster_in_reach: 'header.sandbox.result.disaster_in_reach',
  disaster_none: 'header.sandbox.result.disaster_none',
}

/** The player-facing sentence for an outcome, or null when its code has none of its own. */
export function describeOutcome(outcome: CommandOutcome): string | null {
  // Own keys only: a code such as "constructor" must not find a property of the object.
  if (!Object.prototype.hasOwnProperty.call(RESULT_KEYS, outcome.code)) return null
  const key = RESULT_KEYS[outcome.code]
  if (!key) return null
  const damage = outcome.code.startsWith('disaster_') ? describeDamage(outcome) : null
  if (outcome.code === 'disaster_buildings' && damage) return damage
  const said = t(key, { count: outcome.count, name: outcome.name ?? '' })
  return damage ? `${said} · ${damage}` : said
}
