import { Art } from './art.ts'
import { C, INK } from './palette.ts'

/** A peak's four tones: the face in the light, the crease down its crest, the face in shade, and its foot. */
type Stone = readonly [lit: number, crease: number, shade: number, foot: number]
// A tone lighter on its lit face than the rock it stands on, so a peak reads against its own range.
const GRANITE: Stone = [C.grey8, C.grey6, C.grey5, C.grey4]
const BASALT: Stone = [C.grey5, C.grey4, C.grey3, C.grey2]

/** Width and height of the three sizes of peak, before the outline. */
const SIZES = [
  [9, 6],
  [13, 9],
  [17, 13],
] as const

/** The largest peak with its outline: what a cell must hold. */
export const PEAK_W = 19
export const PEAK_H = 15

/**
 * A mountain peak, drawn like every other sprite: a triangle with its crest a little left of centre, the
 * north-west face in the light and the south-east face in shade, a crease running down from the summit, and
 * (on the high ones) a cap of snow with a broken lower edge. `variant` leans the summit one way or the other,
 * so a range is not one peak repeated.
 */
export function peakArt(size: 0 | 1 | 2, snow: boolean, volcanic: boolean, variant: 0 | 1): Art {
  const [w, h] = SIZES[size]
  const stone = volcanic ? BASALT : GRANITE
  const a = new Art(w + 2, h + 2)
  // The summit sits left of centre (or right, for the other variant), so the lit face is the shorter, steeper one.
  const summit = variant === 0 ? Math.floor(w * 0.42) : Math.floor(w * 0.56)
  const snowRows = snow ? Math.max(3, Math.round(h * 0.34)) : 0
  for (let j = 0; j < h; j++) {
    const t = (j + 1) / h
    const left = Math.round(summit * (1 - t))
    const right = Math.round(summit + (w - 1 - summit) * t)
    for (let x = left; x <= right; x++) {
      const lit = x < summit
      let c = lit ? stone[0] : x === summit ? stone[1] : stone[2]
      // The foot of the shaded face is a tone deeper, and so is its outer edge.
      if (!lit && (j === h - 1 || x === right)) c = stone[3]
      // Snow: white on the lit face, blue-grey on the shaded one, ending in a ragged line.
      const reach = snowRows + (x % 2 === 0 ? 0 : -1)
      if (j < reach) c = x <= summit ? C.grey9 : C.grey8
      a.set(1 + x, 1 + j, c)
    }
  }
  // A second crease on the lit face of the bigger peaks: a gully, two pixels off the crest.
  if (size > 0)
    for (let j = Math.max(snowRows, 2); j < h - 1; j += 2)
      a.set(1 + Math.max(1, summit - 2 - (j >> 2)), 1 + j, stone[1])
  return a.outline(INK).trim()
}

export interface Peak {
  /** The tile the peak stands on. */
  x: number
  y: number
  size: 0 | 1 | 2
  snow: boolean
  variant: 0 | 1
  /** Pixels the peak is nudged sideways from its tile's centre, so a range is not a grid. */
  nudge: number
}

function hash(x: number, y: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return (h ^ (h >>> 16)) >>> 0
}

/** How deep inside a range (in tiles) a peak of each kind stands. */
const MEDIUM_FROM = 3
const LARGE_FROM = 4
const SNOW_FROM = 6

/**
 * Where the peaks of the ranges stand, north to south (so the nearer ones are drawn over the farther).
 * `heights` is how many tiles deep each tile lies inside its range (see `mountainHeights`). Peaks stand on a
 * staggered lattice, one to about six tiles, never on the outermost ring of a range: small at the edge, large
 * and snow-capped in the heart of a wide one.
 */
export function mountainPeaks(heights: Uint8Array, width: number, height: number): Peak[] {
  const out: Peak[] = []
  for (let y = 0; y < height; y++) {
    if (y % 2 !== 0) continue
    for (let x = 0; x < width; x++) {
      const deep = heights[y * width + x]
      // Every second row, every third column, each row starting where its own hash says: a lattice with no
      // straight lines of peaks in it.
      if (deep < 2 || x % 3 !== ((y >> 1) + (hash(y, 7) % 3)) % 3) continue
      const h = hash(x, y)
      const size = deep >= LARGE_FROM ? 2 : deep >= MEDIUM_FROM ? 1 : 0
      out.push({ x, y, size, snow: deep >= SNOW_FROM, variant: (h & 1) as 0 | 1, nudge: ((h >>> 3) % 3) - 1 })
    }
  }
  return out
}
