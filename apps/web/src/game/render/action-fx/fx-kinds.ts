import type { SandboxCommand } from '../../../simulation/sandbox'

/** The effects a god tool can play where it lands. */
export type FxKind =
  | 'bolt'
  | 'storm_bolts'
  | 'fire'
  | 'meteor'
  | 'meteor_shower'
  | 'comet'
  | 'nuke'
  | 'eruption'
  | 'quake'
  | 'sinkhole'
  | 'black_hole'
  | 'acid'
  | 'tornado'
  | 'wave'
  | 'water'
  | 'rain'
  | 'swarm'
  | 'plague'
  | 'blight'
  | 'frost'
  | 'hail'
  | 'heal'
  | 'bless'
  | 'inspire'
  | 'hearts'
  | 'peace'
  | 'war'
  | 'spawn'
  | 'summon'
  | 'grow'
  | 'paint'
  | 'dust'
  // Weather that fills the whole view.
  | 'sky_rain'
  | 'sky_storm'
  | 'sky_snow'
  | 'sky_heat'
  | 'sky_fog'
  | 'sky_sun'
  | 'sky_wind'

export interface FxSpec {
  /** How long it plays, in milliseconds. */
  ms: number
  /** Screen shake in CSS pixels at its strongest; 0 for none. */
  shake: number
  shakeMs?: number
  /** When the shake starts after the effect does (a meteor shakes on impact, not as it falls). */
  shakeDelay?: number
}

export const FX_SPECS: Record<FxKind, FxSpec> = {
  bolt: { ms: 900, shake: 3, shakeMs: 250 },
  storm_bolts: { ms: 1400, shake: 4, shakeMs: 900 },
  fire: { ms: 1500, shake: 0 },
  meteor: { ms: 1700, shake: 7, shakeMs: 600, shakeDelay: 380 },
  meteor_shower: { ms: 2200, shake: 6, shakeMs: 1300, shakeDelay: 380 },
  comet: { ms: 1800, shake: 0 },
  nuke: { ms: 6000, shake: 14, shakeMs: 1800, shakeDelay: 60 },
  eruption: { ms: 2600, shake: 8, shakeMs: 1200 },
  quake: { ms: 1500, shake: 9, shakeMs: 1100 },
  sinkhole: { ms: 2000, shake: 7, shakeMs: 900 },
  black_hole: { ms: 2600, shake: 5, shakeMs: 2000 },
  acid: { ms: 2200, shake: 0 },
  tornado: { ms: 2200, shake: 3, shakeMs: 1800 },
  wave: { ms: 2000, shake: 4, shakeMs: 900, shakeDelay: 300 },
  water: { ms: 1200, shake: 0 },
  rain: { ms: 1800, shake: 0 },
  swarm: { ms: 2000, shake: 0 },
  plague: { ms: 1700, shake: 0 },
  blight: { ms: 1400, shake: 0 },
  frost: { ms: 1400, shake: 0 },
  hail: { ms: 1400, shake: 2, shakeMs: 900 },
  heal: { ms: 1300, shake: 0 },
  bless: { ms: 1400, shake: 0 },
  inspire: { ms: 1200, shake: 0 },
  hearts: { ms: 1400, shake: 0 },
  peace: { ms: 1300, shake: 0 },
  war: { ms: 1100, shake: 2, shakeMs: 300 },
  spawn: { ms: 900, shake: 0 },
  summon: { ms: 1400, shake: 2, shakeMs: 300 },
  grow: { ms: 1200, shake: 0 },
  paint: { ms: 600, shake: 0 },
  dust: { ms: 1000, shake: 2, shakeMs: 300 },
  sky_rain: { ms: 2000, shake: 0 },
  sky_storm: { ms: 2200, shake: 3, shakeMs: 300, shakeDelay: 500 },
  sky_snow: { ms: 2400, shake: 0 },
  sky_heat: { ms: 2200, shake: 0 },
  sky_fog: { ms: 2200, shake: 0 },
  sky_sun: { ms: 1600, shake: 0 },
  sky_wind: { ms: 1600, shake: 0 },
}

/** The monsters a release summons with a dark puff rather than a friendly one. */
const MONSTERS = new Set(['zombie', 'demon', 'dragon', 'alien', 'ufo'])

/** Commands whose effect reaches the radius they carry, by the effect they play. */
const POINT_FX: Partial<Record<SandboxCommand['cmd'], FxKind>> = {
  smite: 'bolt',
  thunder: 'storm_bolts',
  ignite: 'fire',
  wildfire: 'fire',
  meteor: 'meteor',
  meteor_shower: 'meteor_shower',
  comet: 'comet',
  nuke: 'nuke',
  volcano: 'eruption',
  earthquake: 'quake',
  sinkhole: 'sinkhole',
  black_hole: 'black_hole',
  acid_rain: 'acid',
  tornado: 'tornado',
  tsunami: 'wave',
  flood: 'water',
  douse: 'water',
  bless_river: 'water',
  rain_patch: 'rain',
  locusts: 'swarm',
  poison: 'plague',
  curse: 'plague',
  outbreak: 'plague',
  blight: 'blight',
  blizzard: 'frost',
  freeze: 'frost',
  hail: 'hail',
  heal: 'heal',
  heal_one: 'heal',
  cure: 'heal',
  cure_tribe: 'heal',
  tribe_gift: 'heal',
  gift: 'heal',
  bless: 'bless',
  revive: 'bless',
  ward: 'bless',
  bounty: 'bless',
  long_life: 'bless',
  mutate: 'bless',
  talent: 'bless',
  guardian: 'bless',
  era_tribe: 'bless',
  repair: 'bless',
  place_building: 'bless',
  banish: 'bless',
  inspire: 'inspire',
  arm: 'inspire',
  courage: 'inspire',
  make_leader: 'inspire',
  teach_nearby: 'inspire',
  love: 'hearts',
  peace: 'peace',
  tame: 'peace',
  war: 'war',
  frenzy: 'war',
  spawn: 'spawn',
  family: 'spawn',
  teleport: 'spawn',
  migrate_tribe: 'spawn',
  split_tribe: 'spawn',
  harvest: 'grow',
  sunshine: 'grow',
  plant: 'grow',
  paint_biome: 'grow',
  restore: 'grow',
  bless_forest: 'grow',
  paint: 'paint',
  road: 'paint',
  place_boat: 'paint',
  clear_region: 'dust',
  demolish: 'dust',
}

/** Two-click commands play at the second click. */
const PAIR_FX: Partial<Record<SandboxCommand['cmd'], FxKind>> = {
  marry: 'hearts',
  merge_tribes: 'peace',
  trade_gift: 'peace',
}

export interface PlannedFx {
  kind: FxKind
  x: number | null
  y: number | null
  r: number
}

/** The effect a command plays and where, or null for a command with none (renames, guidance, time). */
export function fxForCommand(cmd: SandboxCommand): PlannedFx | null {
  if (cmd.cmd === 'weather') {
    const kind: Record<typeof cmd.kind, FxKind> = {
      rain: 'sky_rain',
      monsoon: 'sky_rain',
      storm: 'sky_storm',
      snow: 'sky_snow',
      cold_snap: 'sky_snow',
      fog: 'sky_fog',
      clear: 'sky_sun',
    }
    return { kind: kind[cmd.kind], x: null, y: null, r: 1 }
  }
  if (cmd.cmd === 'gale') return { kind: 'sky_wind', x: null, y: null, r: 1 }
  if (cmd.cmd === 'heat_wave') return { kind: 'sky_heat', x: null, y: null, r: 1 }
  if (cmd.cmd === 'drought') return { kind: cmd.active ? 'sky_heat' : 'sky_rain', x: null, y: null, r: 1 }
  const pair = PAIR_FX[cmd.cmd]
  if (pair && 'bx' in cmd) return { kind: pair, x: cmd.bx, y: cmd.by, r: 3 }
  if (!('x' in cmd) || typeof cmd.x !== 'number' || typeof cmd.y !== 'number') return null
  let kind = POINT_FX[cmd.cmd]
  if (cmd.cmd === 'spawn_animal') kind = MONSTERS.has(cmd.kind ?? '') ? 'summon' : 'spawn'
  if (!kind) return null
  const radius = 'radius' in cmd && typeof cmd.radius === 'number' ? cmd.radius : 0
  return { kind, x: cmd.x, y: cmd.y, r: Math.max(defaultReach(kind), radius) }
}

/** The reach an effect plays at when its command carries no radius (or a smaller one). */
function defaultReach(kind: FxKind): number {
  switch (kind) {
    case 'nuke':
      // The bomb's blast (crates/sim-core/src/sim/command/nuke.rs BLAST_RADIUS).
      return 16
    case 'eruption':
      return 6
    case 'wave':
    case 'comet':
      return 8
    case 'war':
    case 'peace':
    case 'hearts':
      return 3
    default:
      return 1
  }
}
