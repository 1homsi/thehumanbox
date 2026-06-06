import type { SceneContext, SceneFixture, SceneId } from '../../../scenes/core/types'
import type { OrganismState, WorldState } from '../../../types'
import { householdAround } from '../../../scenes/shared/occupants'

const ERA_LABEL: Record<string, string> = {
  'pre-stone': 'A bare windbreak',
  stone: 'A stone-walled hut',
  bronze: 'A timber-and-thatch home',
  iron: 'An iron-age cottage',
  classical: 'A clay-tiled house',
  medieval: 'A timbered cottage',
  renaissance: 'A two-story dwelling',
  industrial: 'A brick row-house',
  modern: 'A house',
  information: 'A small apartment',
}

interface Slot {
  x: number
  y: number
}

const WALL_SLOTS: Slot[] = [
  { x: 18, y: 22 },
  { x: 36, y: 22 },
  { x: 54, y: 22 },
  { x: 72, y: 22 },
  { x: 90, y: 22 },
  { x: 18, y: 78 },
  { x: 36, y: 78 },
  { x: 54, y: 78 },
  { x: 72, y: 78 },
  { x: 90, y: 78 },
]

const FLOOR_SLOTS: Slot[] = [
  { x: 30, y: 50 },
  { x: 50, y: 45 },
  { x: 70, y: 50 },
  { x: 40, y: 60 },
  { x: 60, y: 60 },
  { x: 25, y: 65 },
  { x: 78, y: 38 },
  { x: 78, y: 65 },
  { x: 50, y: 35 },
  { x: 15, y: 45 },
]

const ANCHOR_SLOTS: Record<string, Slot> = {
  hearth: { x: 18, y: 70 },
  fireplace: { x: 18, y: 70 },
  storage: { x: 80, y: 25 },
  wardrobe: { x: 88, y: 30 },
  refrigerator: { x: 90, y: 50 },
  kitchen_stove: { x: 80, y: 65 },
  bookshelf: { x: 18, y: 25 },
  writing_desk: { x: 36, y: 25 },
  computer_desk: { x: 36, y: 25 },
  monitor: { x: 22, y: 30 },
  loom: { x: 80, y: 25 },
  anvil: { x: 80, y: 75 },
  four_poster_bed: { x: 78, y: 70 },
  piano: { x: 28, y: 28 },
  gramophone: { x: 72, y: 28 },
  television: { x: 50, y: 22 },
  radio_set: { x: 22, y: 28 },
  sofa: { x: 50, y: 60 },
  armchair: { x: 70, y: 55 },
  coffee_table: { x: 50, y: 70 },
  table: { x: 50, y: 50 },
  shelf: { x: 18, y: 30 },
  bench: { x: 50, y: 30 },
  mat: { x: 80, y: 70 },
  rug: { x: 50, y: 60 },
  painting: { x: 36, y: 22 },
  art_print: { x: 64, y: 22 },
  photo_frame: { x: 50, y: 22 },
  mirror: { x: 90, y: 38 },
  vase_flowers: { x: 50, y: 38 },
  potted_plant: { x: 25, y: 38 },
  standing_plant: { x: 88, y: 65 },
  clay_pot: { x: 36, y: 70 },
  wine_jug: { x: 32, y: 72 },
  oil_lamp: { x: 50, y: 72 },
  desk_lamp: { x: 42, y: 23 },
  clock: { x: 50, y: 18 },
  globe: { x: 32, y: 36 },
  telescope_decor: { x: 88, y: 45 },
  smart_speaker: { x: 22, y: 50 },
}

function defaultsForEra(era: string): string[] {
  switch (era) {
    case 'pre-stone':
      return ['hearth', 'mat']
    case 'stone':
      return ['hearth', 'mat', 'storage']
    case 'bronze':
      return ['hearth', 'mat', 'storage', 'bench', 'clay_pot']
    case 'iron':
      return ['hearth', 'mat', 'storage', 'bench', 'oil_lamp']
    case 'classical':
      return ['hearth', 'storage', 'bench', 'table', 'clay_pot', 'rug']
    case 'medieval':
      return ['fireplace', 'storage', 'table', 'bench', 'four_poster_bed', 'wardrobe']
    case 'renaissance':
      return ['fireplace', 'storage', 'table', 'shelf', 'painting', 'four_poster_bed', 'mirror']
    case 'industrial':
      return ['fireplace', 'storage', 'table', 'shelf', 'armchair', 'photo_frame', 'wardrobe']
    case 'modern':
      return ['kitchen_stove', 'refrigerator', 'sofa', 'coffee_table', 'television', 'four_poster_bed']
    case 'information':
      return [
        'kitchen_stove',
        'refrigerator',
        'sofa',
        'coffee_table',
        'television',
        'computer_desk',
        'monitor',
        'smart_speaker',
      ]
    default:
      return ['hearth', 'mat']
  }
}

function pickSlot(name: string, used: Set<string>, seed: number, idx: number): Slot {
  const anchor = ANCHOR_SLOTS[name]
  if (anchor) {
    const key = `${anchor.x},${anchor.y}`
    if (!used.has(key)) {
      used.add(key)
      return anchor
    }
  }
  // Spread leftovers across floor / wall slots deterministically.
  const isWall =
    name === 'painting' ||
    name === 'art_print' ||
    name === 'photo_frame' ||
    name === 'mirror' ||
    name === 'clock' ||
    name === 'shelf' ||
    name === 'bookshelf'
  const pool = isWall ? WALL_SLOTS : FLOOR_SLOTS
  for (let i = 0; i < pool.length; i++) {
    const candIdx = (seed + idx + i) % pool.length
    const cand = pool[candIdx]
    const key = `${cand.x},${cand.y}`
    if (!used.has(key)) {
      used.add(key)
      return cand
    }
  }
  return pool[(seed + idx) % pool.length]
}

function eraFromWorld(world: WorldState, host: OrganismState): string {
  if (Array.isArray(world.lineage_eras)) {
    return (
      (world.lineage_eras as Array<{ lineage_id: string; era_name: string }>).find(
        (e) => e.lineage_id === host.lineage_id,
      )?.era_name ?? 'pre-stone'
    )
  }
  return ((world.lineage_eras as Record<string, string> | undefined) ?? {})[host.lineage_id] ?? 'pre-stone'
}

export function resolveHomeScene(world: WorldState, scene: SceneId): SceneContext | null {
  if (scene.kind !== 'home') return null
  const host = world.organisms.find((o) => o.id === scene.orgId)
  if (!host || !host.alive) return null

  const era = eraFromWorld(world, host)

  const { inside, away } = householdAround(world, host)

  const lineageName = world.lineage_names?.[host.lineage_id] ?? host.lineage_id.slice(0, 6)
  const isDay = !!world.is_day

  const aiPicked = (host as { home_furniture?: string[] }).home_furniture ?? []
  const seed = ((host as { home_style_seed?: number }).home_style_seed ?? 0) % 997
  const items = aiPicked.length > 0 ? [...defaultsForEra(era), ...aiPicked] : defaultsForEra(era)
  const seen = new Set<string>()
  const unique = items.filter((k) => {
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })

  const used = new Set<string>()
  const fixtures: SceneFixture[] = unique.map((k, i) => {
    const slot = pickSlot(k, used, seed, i)
    return { id: `${k}-${i}`, kind: k, x: slot.x, y: slot.y, label: k.replace(/_/g, ' ') }
  })

  const flavor =
    aiPicked.length === 0
      ? (ERA_LABEL[era] ?? 'A home')
      : `${ERA_LABEL[era] ?? 'A home'} · ${aiPicked.length} chosen pieces`

  return {
    scene,
    world,
    title: `${host.name}'s home`,
    subtitle: `${flavor} · ${lineageName} · ${era}`,
    isDay,
    occupants: inside,
    away,
    fixtures,
  }
}
