import { getBuildingSprite } from '../building-sprites'
import type { BuildingLike } from './types'

/**
 * The finished look of a building as a padded sprite (see `getBuildingSprite`), or null for a kind
 * drawn by hand. A construction site reveals this same sprite as it rises.
 */
export function finishedSprite(
  building: BuildingLike,
  k: string,
  fw: number,
  fh: number,
  tileSize: number,
  nightFactor: number,
  condBucket: number,
): HTMLCanvasElement | null {
  const variant =
    (((building.id ?? 0) * 2654435761) ^ (building.x * 73856093) ^ (building.y * 19349663)) >>> 0
  const nightBucket = Math.max(0, Math.min(3, Math.round(nightFactor * 3)))
  return getBuildingSprite(
    k,
    fw,
    fh,
    tileSize,
    variant & 7,
    nightBucket,
    condBucket,
    building.tier ?? 0,
    building.state ?? '',
    building.snow ?? false,
    building.land ?? '',
    building.roofTint ?? '',
  )
}
