import type { AnimalState, WorldState } from '../../shared/types'
import { findBuildingAtWorldTile } from './building-state'

/** What a tree is, in the words the hover card uses. */
export type TreeKind = 'tree' | 'conifer' | 'bush' | 'dead' | 'cactus' | 'acacia'

/** A thing on the map the hover card can name: a sim thing by its id, or a tile-bound one by its tile. */
export type MapThing =
  | { kind: 'animal' | 'building' | 'vehicle' | 'caravan' | 'farm'; id: number }
  | { kind: 'planting'; x: number; y: number }
  | { kind: 'tree'; x: number; y: number; tree: TreeKind }
  /** The bare ground on a tile no tribe claims (where a claimed tile's ground is in its tribe's card). */
  | { kind: 'ground'; x: number; y: number }

/** The world data the lookup reads. */
export type ThingWorld = Partial<
  Pick<WorldState, 'buildings' | 'vehicles' | 'animals' | 'viewport_animals' | 'farms' | 'plantings'>
>

/** A world point in tiles, as the sim numbers them (not relative to the map corner). */
export interface TilePoint {
  x: number
  y: number
}

/** Things the renderer draws and only it knows where: read from the last frame it drew. */
export interface DrawnThings {
  /** The caravan drawn within `reach` tiles of a world point, by id. */
  caravanAt?: (worldX: number, worldY: number, reach: number) => number | null
  /** The kind of tree standing on the tile under a world point. */
  treeAt?: (worldX: number, worldY: number) => TreeKind | null
}

/** A vehicle is picked within this many tiles of its centre. */
export const VEHICLE_REACH = 0.7
/** An animal is picked within this many tiles of its centre. */
export const ANIMAL_REACH = 0.6
/** A caravan is picked within this many tiles of its drawn centre. */
export const CARAVAN_REACH = 0.8

/** A key that is the same for the same thing, so the card only re-renders when the thing changes. */
export function thingKey(thing: MapThing): string {
  return 'id' in thing ? `${thing.kind}:${thing.id}` : `${thing.kind}:${thing.x},${thing.y}`
}

/**
 * What the pointer rests on, in the order the card reads it: an animal, then the building covering the
 * tile, a vehicle, a caravan on the road, a field, a planting and last a tree. Null for open ground.
 * Cheap enough for every pointer move: a short loop over the animals in view and a scan of the lists.
 */
export function mapThingAt(world: ThingWorld, point: TilePoint, drawn: DrawnThings = {}): MapThing | null {
  const animal = nearestAnimal(world, point)
  if (animal !== null) return { kind: 'animal', id: animal }
  const tx = Math.floor(point.x)
  const ty = Math.floor(point.y)
  const building = findBuildingAtWorldTile(world.buildings, tx, ty)
  if (building) return { kind: 'building', id: building.id }
  const vehicle = nearestVehicle(world.vehicles, point)
  if (vehicle !== null) return { kind: 'vehicle', id: vehicle }
  const caravan = drawn.caravanAt?.(point.x, point.y, CARAVAN_REACH) ?? null
  if (caravan !== null) return { kind: 'caravan', id: caravan }
  const farm = world.farms?.find((item) => Math.floor(item.x) === tx && Math.floor(item.y) === ty)
  if (farm) return { kind: 'farm', id: farm.id }
  if (hasPlanting(world.plantings, tx, ty)) return { kind: 'planting', x: tx, y: ty }
  const tree = drawn.treeAt?.(point.x, point.y) ?? null
  if (tree !== null) return { kind: 'tree', x: tx, y: ty, tree }
  return null
}

/** Things that, on a tribe's land, leave the tribe's card in place rather than taking over the pointer. */
export function leavesTribeCard(thing: MapThing): boolean {
  return thing.kind === 'tree' || thing.kind === 'planting'
}

/** The animals in view when the sim sends them, else every animal it sent. */
export function animalsInView(world: ThingWorld): AnimalState[] {
  return world.viewport_animals?.length ? world.viewport_animals : (world.animals ?? [])
}

/** The id of the animal nearest a point within reach, or null. An animal is drawn at the middle of its tile. */
function nearestAnimal(world: ThingWorld, point: TilePoint): number | null {
  let best: number | null = null
  let bestDistance = ANIMAL_REACH
  for (const animal of animalsInView(world)) {
    if (animal.away) continue
    const distance = Math.hypot(animal.x + 0.5 - point.x, animal.y + 0.5 - point.y)
    if (distance < bestDistance) {
      bestDistance = distance
      best = animal.id
    }
  }
  return best
}

/** The id of the vehicle nearest a point within reach, or null. A vehicle sits at the middle of its tile. */
function nearestVehicle(vehicles: WorldState['vehicles'], point: TilePoint): number | null {
  if (!vehicles) return null
  let best: number | null = null
  let bestDistance = VEHICLE_REACH
  for (const vehicle of vehicles) {
    const distance = Math.hypot(vehicle.x + 0.5 - point.x, vehicle.y + 0.5 - point.y)
    if (distance < bestDistance) {
      bestDistance = distance
      best = vehicle.id
    }
  }
  return best
}

/** Whether a player planting stands on a tile. The list is flat: [x, y, kind, stage, ...]. */
function hasPlanting(flat: number[] | undefined, tx: number, ty: number): boolean {
  if (!flat) return false
  for (let i = 0; i + 3 < flat.length; i += 4) {
    if (flat[i] === tx && flat[i + 1] === ty) return true
  }
  return false
}
