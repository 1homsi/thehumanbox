import type { WorldState } from '../../shared/types'
import { TILE_ID } from './terrain-ids'

/** What the ground under a tile is, in the words the hover card uses. */
export type GroundKey =
  | 'grass'
  | 'shallowWater'
  | 'deepWater'
  | 'floodwater'
  | 'sand'
  | 'snow'
  | 'ice'
  | 'rock'
  | 'ash'
  | 'scorched'
  | 'lava'
  | 'mineral'
  | 'foodGround'
  | 'fire'
  | 'campfire'

/** A thing about the ground that is not the ground itself. */
export type GroundNote = 'track' | 'rail' | 'canal' | 'bridge' | 'fertile' | 'onFire'

export interface TerrainFacts {
  ground: GroundKey
  notes: GroundNote[]
}

/** The road kinds the grid records per cell (`ROAD_*` in sim-core's world/grid.rs). */
const ROAD_NOTE: Record<number, GroundNote> = { 1: 'track', 2: 'bridge', 3: 'rail', 4: 'canal' }

/** Water with a wire depth below this is deep: the same bar the simulation uses (a depth above 0.18). */
export const DEEP_WATER_WIRE = 164
/** Soil at or above this fertility is fertile (the sim counts a fertility above 0.4 as good land). */
export const FERTILE_SOIL = 0.6

const GROUND: Partial<Record<number, GroundKey>> = {
  [TILE_ID.GRASS]: 'grass',
  [TILE_ID.FOOD]: 'foodGround',
  [TILE_ID.FIRE]: 'fire',
  [TILE_ID.CAMPFIRE]: 'campfire',
  [TILE_ID.ROCK]: 'rock',
  [TILE_ID.ASH]: 'ash',
  [TILE_ID.FLOODED]: 'floodwater',
  [TILE_ID.MINERAL]: 'mineral',
  [TILE_ID.SCORCHED]: 'scorched',
  [TILE_ID.SNOW]: 'snow',
  [TILE_ID.SAND]: 'sand',
  [TILE_ID.LAVA]: 'lava',
  [TILE_ID.ICE]: 'ice',
}

/**
 * What the ground is at a world tile: its kind (water told apart by depth), and the roads, fire and
 * fertility on it. Null off the grid, on the empty sea past the map, and on a hut's tile (a building
 * has its own card). Reads the grid arrays only, so it is cheap enough for every pointer move.
 */
export function terrainAt(
  world: Pick<WorldState, 'grid'>,
  worldX: number,
  worldY: number,
): TerrainFacts | null {
  const grid = world.grid
  const col = Math.floor(worldX) - (grid.origin_x ?? 0)
  const row = Math.floor(worldY) - (grid.origin_y ?? 0)
  const tile = grid.tiles?.[row]?.[col]
  if (tile === undefined) return null
  const ground = groundOf(tile, grid.depth_map?.[row]?.[col])
  if (!ground) return null
  const notes: GroundNote[] = []
  const road = grid.roads?.[row]?.[col] ?? 0
  if (ROAD_NOTE[road]) notes.push(ROAD_NOTE[road]!)
  const soilIsFertile = ground === 'grass' || ground === 'foodGround'
  if (soilIsFertile && (grid.fertility?.[row]?.[col] ?? 0) >= FERTILE_SOIL) notes.push('fertile')
  if ((grid.fire_intensity?.[row]?.[col] ?? 0) > 0 && ground !== 'fire') notes.push('onFire')
  return { ground, notes }
}

function groundOf(tile: number, depth: number | undefined): GroundKey | null {
  if (tile === TILE_ID.WATER) {
    if (depth === undefined) return 'shallowWater'
    return depth < DEEP_WATER_WIRE ? 'deepWater' : 'shallowWater'
  }
  return GROUND[tile] ?? null
}

/**
 * Whether the ground under a point is worth a card of its own on unclaimed land: water, snow, ice, sand and
 * the rest, or grass with a road or a fire on it. Plain grass (fertile or not) is most of the map, and a card
 * for it under every pointer move was noise.
 */
export function groundIsNotable(facts: TerrainFacts | null): boolean {
  if (!facts) return false
  if (facts.ground !== 'grass') return true
  return facts.notes.some((note) => note !== 'fertile')
}
