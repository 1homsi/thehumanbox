import { TILE } from '../../model/palette'
import { resolveBuildingFootprint } from '../building-draw/footprints'

/** A rectangle in map pixels, top-left corner and size. */
export interface MapRect {
  x: number
  y: number
  w: number
  h: number
}

/** A standing person, head to feet, centred on their tile. */
export function personRect(org: { x: number; y: number }, ox: number, oy: number): MapRect {
  const cx = (org.x - ox) * TILE + TILE / 2
  const cy = (org.y - oy) * TILE + TILE / 2
  return { x: cx - 7, y: cy - 19, w: 14, h: 22 }
}

/** An animal: a small box centred on its tile. */
export function animalRect(a: { x: number; y: number }, ox: number, oy: number): MapRect {
  const cx = (a.x - ox) * TILE + TILE / 2
  const cy = (a.y - oy) * TILE + TILE / 2
  return { x: cx - 6, y: cy - 6, w: 12, h: 12 }
}

/** A building: its footprint, from its top-left tile. */
export function buildingRect(
  b: Parameters<typeof resolveBuildingFootprint>[0] & { x: number; y: number },
  ox: number,
  oy: number,
): MapRect {
  const [fw, fh] = resolveBuildingFootprint(b)
  return { x: (b.x - ox) * TILE, y: (b.y - oy) * TILE, w: fw * TILE, h: fh * TILE }
}

/**
 * The animal nearest a map point, within `reach` map pixels, or null. Animals have no sprite
 * picker of their own, so the hover looks them up by distance from the tile centres.
 */
export function nearestAnimal<A extends { x: number; y: number }>(
  animals: ReadonlyArray<A>,
  mapX: number,
  mapY: number,
  ox: number,
  oy: number,
  reach = TILE * 0.7,
): A | null {
  let best: A | null = null
  let bestD = reach * reach
  for (const a of animals) {
    const dx = (a.x - ox) * TILE + TILE / 2 - mapX
    const dy = (a.y - oy) * TILE + TILE / 2 - mapY
    const d = dx * dx + dy * dy
    if (d <= bestD) {
      bestD = d
      best = a
    }
  }
  return best
}
