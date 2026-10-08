import type { Building } from '../../../../shared/types'
import { TILE } from '../../../model/palette'
import { landscapeHash } from '../../landscape-style'
import { normKind } from '../../building-draw/footprints'

/**
 * The yard of a home: a small vegetable plot beside it, with sprouts, and a picket fence along the
 * plot's south edge. Only homes get one, and not all of them: a fixed hash of the building decides,
 * so the same homes always have gardens and the village looks the same every time it is drawn.
 */

export interface YardRect {
  /** Top-left corner and size, in painter px (grid px, origin removed). */
  x: number
  y: number
  w: number
  h: number
  colour: number
}

const HOME_KINDS = new Set(['House', 'Hut', 'Cottage'])

/** Packed 0xRRGGBBAA, as the sprite layers take it. */
function rgba(r: number, g: number, b: number, a = 255): number {
  return ((r << 24) | (g << 16) | (b << 8) | a) >>> 0
}

const SOIL = rgba(92, 62, 36, 220)
const SPROUT = rgba(96, 150, 70, 255)
const SPROUT_LIGHT = rgba(140, 184, 90, 255)
const POST = rgba(132, 96, 56, 255)
const RAIL = rgba(108, 78, 46, 255)

/** Whether this building gets a yard at all (homes only, about two in three of them). */
export function hasYard(b: Pick<Building, 'kind' | 'id'>): boolean {
  return HOME_KINDS.has(normKind(b.kind)) && landscapeHash(b.id, 41) % 3 !== 0
}

/**
 * The rectangles of every yard for the homes in `buildings`. The yard sits on the tile east of the
 * home, so it never lies under the house itself. Each yard is about a tile wide: a soil plot, six
 * sprouts in two rows, and four posts with a rail along the south side.
 */
export function yardRects(buildings: readonly Building[], ox: number, oy: number): YardRect[] {
  const out: YardRect[] = []
  for (const b of buildings) {
    if (typeof b.x !== 'number' || typeof b.y !== 'number' || !hasYard(b)) continue
    const x0 = (b.x + 1 - ox) * TILE + 1
    const y0 = (b.y - oy) * TILE + TILE * 0.4
    const plot = TILE - 2
    const depth = TILE * 0.75
    out.push({ x: x0, y: y0, w: plot, h: depth, colour: SOIL })
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 3; c++) {
        out.push({
          x: x0 + 1 + c * 2,
          y: y0 + 1 + r * 2,
          w: 1,
          h: 2,
          colour: (r + c) % 2 === 0 ? SPROUT : SPROUT_LIGHT,
        })
      }
    }
    const fenceY = y0 + depth
    for (let p = 0; p < 3; p++) out.push({ x: x0 + p * 2, y: fenceY - 1, w: 1, h: 3, colour: POST })
    out.push({ x: x0, y: fenceY, w: plot, h: 1, colour: RAIL })
  }
  return out
}
