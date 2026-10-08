import { landscapeHash } from '../../landscape-style'
import { rgba } from '../frame'

/**
 * What a season puts on the crowns of the trees: blossom in spring, turning leaves in autumn,
 * snow on the top of the canopy in winter, nothing in summer. The specks are placed inside each
 * crown's ellipse by a hash of the tree, so they stay put from frame to frame and only change when
 * the trees are rebuilt.
 */

export interface Dressing {
  /** Specks per tree. */
  count: number
  colours: readonly number[]
  /** Snow sits on the top half of the crown only. */
  topOnly: boolean
}

const DRESSING: Record<string, Dressing> = {
  spring: {
    count: 9,
    colours: [rgba(246, 182, 206, 255), rgba(255, 244, 250, 255)],
    topOnly: false,
  },
  autumn: {
    count: 7,
    colours: [rgba(204, 88, 40, 255), rgba(226, 172, 58, 255)],
    topOnly: false,
  },
  winter: {
    count: 8,
    colours: [rgba(240, 246, 255, 255)],
    topOnly: true,
  },
}

/** The dressing a season adds to trees, or null when it adds nothing. */
export function dressingFor(season: string): Dressing | null {
  return DRESSING[season] ?? null
}

/** Crown ellipse of a tree whose box starts at (cx, cy) and is `sz` wide. */
export function crownCentre(
  cx: number,
  cy: number,
  sz: number,
): { x: number; y: number; rx: number; ry: number } {
  return { x: cx + sz * 0.5, y: cy + sz * 0.36, rx: sz * 0.36, ry: sz * 0.3 }
}

/** The speck `k` of tree `seed` (its position in the crown, its colour index and its size). */
export function crownSpeck(
  dressing: Dressing,
  seed: number,
  k: number,
  cx: number,
  cy: number,
  sz: number,
): { x: number; y: number; size: number; colour: number } {
  const crown = crownCentre(cx, cy, sz)
  const a = (landscapeHash(seed * 31 + k, 7) / 4294967296) * Math.PI * 2
  const r = Math.sqrt(landscapeHash(seed * 17 + k, 13) / 4294967296)
  const sin = Math.sin(a)
  // A snow cap sits on the upper half of the crown, a blossom or leaf anywhere in it.
  const dy = dressing.topOnly ? -Math.abs(sin) : sin
  const size = Math.max(1, Math.round(sz * 0.08))
  return {
    x: crown.x + Math.cos(a) * r * crown.rx,
    y: crown.y + dy * r * crown.ry,
    size,
    colour: dressing.colours[landscapeHash(seed * 5 + k, 19) % dressing.colours.length],
  }
}
