import type { WorldState } from '../../shared/types'
import { findBuildingAtWorldTile } from './building-state'

/** A thing on the map the hover card can name, by the id the sim gave it. */
export type MapThing =
  { kind: 'building'; id: number } | { kind: 'vehicle'; id: number } | { kind: 'caravan'; id: number }

/** A world point in tiles, as the sim numbers them (not relative to the map corner). */
export interface TilePoint {
  x: number
  y: number
}

/** A vehicle is picked within this many tiles of its centre. */
export const VEHICLE_REACH = 0.7
/** A caravan is picked within this many tiles of its drawn centre. */
export const CARAVAN_REACH = 0.8

/** The caravan drawn nearest a world point, as its id, or null. Supplied by the renderer, which knows where it drew them. */
export type CaravanAt = (worldX: number, worldY: number, reach: number) => number | null

/**
 * What the pointer rests on, in the order the hover card reads it: a building covering its tile,
 * then a vehicle, then a caravan on the road. Null for open ground. Cheap enough for every pointer move.
 */
export function mapThingAt(
  world: Pick<WorldState, 'buildings' | 'vehicles'>,
  point: TilePoint,
  caravanAt?: CaravanAt,
): MapThing | null {
  const building = findBuildingAtWorldTile(world.buildings, Math.floor(point.x), Math.floor(point.y))
  if (building) return { kind: 'building', id: building.id }
  const vehicle = nearestVehicle(world.vehicles, point)
  if (vehicle !== null) return { kind: 'vehicle', id: vehicle }
  const caravan = caravanAt?.(point.x, point.y, CARAVAN_REACH) ?? null
  if (caravan !== null) return { kind: 'caravan', id: caravan }
  return null
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
