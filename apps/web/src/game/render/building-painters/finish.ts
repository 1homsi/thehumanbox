import { INK, SHADOW } from '../art-palette'
import type { Rgb } from '../art-palette'
import { PAD, PAD_BOT } from './kit'

/** Flat things on the ground (paving, water, fields, crossings): no height, so no cast shadow. */
const FLAT_KINDS = new Set([
  'Plaza',
  'Pond',
  'Reservoir',
  'Garden',
  'Aquaculture',
  'MushroomFarm',
  'Cemetery',
  'ParkingLot',
  'Crosswalk',
  'Pen',
  'Bridge',
  'Dock',
  'Port',
  'Marina',
  'Fence',
  'Bench',
  'Hyperloop',
  'Maglev',
])

/** Alpha from which a pixel counts as part of the building's silhouette. */
const SOLID = 96

/** How far a colour is pulled toward warm parchment so the many painter hexes sit in one palette. */
const WARM: Rgb = [178, 150, 112]
const WARM_SHARE = 0.1
/** Saturation above this is compressed: no neon, but sea-glass and brick still read as themselves. */
const SAT_KNEE = 0.38
const SAT_SLOPE = 0.55
/** The silhouette is the ink colour with a little of the pixel's own colour left in it. */
const EDGE_INK = 0.8

/** Earthy version of a painter colour: warmed a little and with its strongest saturation reined in. */
export function earthy(r: number, g: number, b: number): Rgb {
  let rr = r + (WARM[0] - r) * WARM_SHARE
  let gg = g + (WARM[1] - g) * WARM_SHARE
  let bb = b + (WARM[2] - b) * WARM_SHARE
  const mx = Math.max(rr, gg, bb)
  const mn = Math.min(rr, gg, bb)
  const l = (mx + mn) / 510
  const d = (mx - mn) / 255
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  if (s > SAT_KNEE) {
    // Scale the distance from grey of the same lightness.
    const f = (SAT_KNEE + (s - SAT_KNEE) * SAT_SLOPE) / s
    const grey = (mx + mn) / 2
    rr = grey + (rr - grey) * f
    gg = grey + (gg - grey) * f
    bb = grey + (bb - grey) * f
  }
  return [Math.round(rr), Math.round(gg), Math.round(bb)]
}

/**
 * Where the flat shadow of a building falls: rows of [x from, x to), top to bottom, on the ground to the
 * right of and below its base. It starts under the building's bottom edge (`groundY`) and leans down and
 * to the right, as far as the cell's padding allows, longer for taller buildings.
 */
export function shadowRows(
  bx0: number,
  bx1: number,
  groundY: number,
  height: number,
  room: number,
): { y: number; x0: number; x1: number }[] {
  const reach = Math.min(room, 6, Math.max(2, Math.round(height * 0.22)))
  const depth = Math.min(PAD_BOT, Math.max(1, Math.round(reach / 2)))
  const lift = Math.min(5, Math.max(2, Math.round(height * 0.1)))
  const rows = []
  for (let i = 0; i < lift + depth; i++) {
    const t = i / (lift + depth - 1)
    const x1 = bx1 + 1 + Math.round(reach * t)
    const x0 = i < lift ? bx0 + 1 : bx0 + 1 + Math.round((reach * (i - lift + 1)) / depth)
    rows.push({ y: groundY - lift + i, x0, x1 })
  }
  return rows
}

/**
 * Every pixel either part of the building or not: the half-covered pixels canvas leaves along slopes and
 * curves are dropped or made whole at the silhouette threshold. Those soft edges made roofs and domes read
 * as smooth vector art rather than pixel art; snapped, a slope is a clean staircase of whole pixels.
 */
export function snapToPixels(d: Uint8ClampedArray) {
  for (let o = 3; o < d.length; o += 4) {
    if (d[o] === 0 || d[o] === 255) continue
    if (d[o] < SOLID) {
      d[o - 3] = 0
      d[o - 2] = 0
      d[o - 1] = 0
      d[o] = 0
    } else {
      d[o] = 255
    }
  }
}

/** How much darker the receding side wall is than the front, and how much lighter the top. */
const SIDE_SHADE = 0.7
const TOP_LIGHT = 1.1
/** The inner ink line where the front meets the side or the top. */
const FOLD_INK = 0.55

/** How far a building of this footprint depth (in pixels) recedes up and to the right. */
export function depthFor(depthPx: number, room: number): number {
  return Math.max(0, Math.min(room, 5, Math.round(depthPx * 0.2)))
}

/**
 * The most common front colour in the five rows around each row: the wall or roof there, not a window,
 * a beam or one course of its bricks.
 */
function rowColours(d: Uint8ClampedArray, width: number, height: number, front: Uint8Array): number[] {
  const perRow: Map<number, number>[] = []
  for (let y = 0; y < height; y++) {
    const counts = new Map<number, number>()
    for (let x = 0; x < width; x++) {
      if (!front[y * width + x]) continue
      const o = (y * width + x) * 4
      const c = (d[o] << 16) | (d[o + 1] << 8) | d[o + 2]
      counts.set(c, (counts.get(c) ?? 0) + 1)
    }
    perRow.push(counts)
  }
  const out = new Array<number>(height).fill(-1)
  const sum = new Map<number, number>()
  for (let y = 0; y < height; y++) {
    if (perRow[y].size === 0) continue
    sum.clear()
    for (let r = Math.max(0, y - 2); r <= Math.min(height - 1, y + 2); r++) {
      for (const [c, n] of perRow[r]) sum.set(c, (sum.get(c) ?? 0) + n)
    }
    let bestN = 0
    for (const [c, n] of sum) {
      if (n > bestN || (n === bestN && c < out[y])) {
        bestN = n
        out[y] = c
      }
    }
  }
  return out
}

/** Length of the run of front pixels through (x, y) in its row. */
function runAt(front: Uint8Array, width: number, x: number, y: number): number {
  let a = x
  let b = x
  while (a > 0 && front[y * width + a - 1]) a--
  while (b < width - 1 && front[y * width + b + 1]) b++
  return b - a + 1
}

/**
 * The building seen a little from above, as the trees and people are: every solid pixel is carried up to
 * `depth` pixels back, up and to the right, behind the front. What shows of it is a side wall along the
 * right (in shade) and a top along the upper edge (in light): roofs become a slope going back, towers a
 * block. Each face takes the most common colour of the rows it continues, so it is that wall or roof in one
 * flat tone and a window at the corner does not smear along it. Thin upright
 * parts (chimneys, masts, spires) go back only as far as they are wide. Returns the new silhouette:
 * 1 for the front, 2 for what the depth added.
 */
export function extrude(
  d: Uint8ClampedArray,
  width: number,
  height: number,
  front: Uint8Array,
  depth: number,
): Uint8Array {
  const solid = new Uint8Array(front)
  if (depth <= 0) return solid
  const at = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height && front[y * width + x] === 1
  const rows = rowColours(d, width, height, front)
  // How far each front pixel may go back: thin where its row and the row two below are both thin.
  const reach = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!at(x, y)) continue
      const run = runAt(front, width, x, y)
      const below = at(x, y + 2) ? runAt(front, width, x, y + 2) : 0
      reach[y * width + x] = run <= 3 && below <= 3 ? Math.min(depth, Math.max(1, run - 1)) : depth
    }
  }
  for (let k = 1; k <= depth; k++) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!at(x, y) || reach[y * width + x] < k) continue
        const tx = x + k
        const ty = y - k
        if (tx >= width || ty < 0) continue
        const t = ty * width + tx
        if (solid[t]) continue
        const o = t * 4
        // A flat top (nothing above, solid to the right) is in light; a side, or a slope going down to
        // the right, is in shade. Either way one flat tone from the rows it continues.
        const c = rows[y]
        const f = !at(x, y - 1) && at(x + 1, y) ? TOP_LIGHT : SIDE_SHADE
        d[o] = Math.min(255, Math.round(((c >> 16) & 255) * f))
        d[o + 1] = Math.min(255, Math.round(((c >> 8) & 255) * f))
        d[o + 2] = Math.min(255, Math.round((c & 255) * f))
        d[o + 3] = 255
        solid[t] = 2
      }
    }
  }
  return solid
}

/**
 * The last step of a building sprite, over what the painter drew: every pixel made whole or empty, the
 * colours go earthy, the building gets its depth (see extrude), the outer edge becomes the warm ink, and
 * a flat cast shadow lies under it to the bottom-right. Done on pixels because ~200 painters share it;
 * the sprite is cached, so this runs once per look, not per frame. `depthPx` is the footprint's depth.
 */
export function finishSprite(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  kind: string,
  depthPx = 0,
) {
  const groundY = height - PAD_BOT
  const img = ctx.getImageData(0, 0, width, height)
  const d = img.data
  snapToPixels(d)
  const front = new Uint8Array(width * height)
  let bx0 = width
  let bx1 = -1
  let top = height
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4
      if (d[o + 3] < SOLID) continue
      front[y * width + x] = 1
      const [r, g, b] = earthy(d[o], d[o + 1], d[o + 2])
      d[o] = r
      d[o + 1] = g
      d[o + 2] = b
      if (y < groundY && y >= groundY - 4) {
        if (x < bx0) bx0 = x
        if (x > bx1) bx1 = x
      }
      if (y < top) top = y
    }
  }
  const buildingHeight = groundY - top
  const raised = bx1 >= 0 && buildingHeight >= 7 && !FLAT_KINDS.has(kind)
  const depth = raised ? depthFor(depthPx, Math.min(top, width - 1 - bx1 - 2)) : 0
  const solid = extrude(d, width, height, front, depth)
  const filled = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height && solid[y * width + x] !== 0
  const ink = (o: number, share: number) => {
    d[o] = Math.round(d[o] + (INK[0] - d[o]) * share)
    d[o + 1] = Math.round(d[o + 1] + (INK[1] - d[o + 1]) * share)
    d[o + 2] = Math.round(d[o + 2] + (INK[2] - d[o + 2]) * share)
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      if (!solid[i]) continue
      if (!filled(x - 1, y) || !filled(x + 1, y) || !filled(x, y - 1) || !filled(x, y + 1))
        ink(i * 4, EDGE_INK)
      // The fold between the front and its side or top.
      else if (solid[i] === 1 && (solid[i + 1] === 2 || solid[i - width] === 2)) ink(i * 4, FOLD_INK)
    }
  }
  ctx.putImageData(img, 0, 0)

  if (!raised) return
  const room = width - 1 - bx1
  ctx.save()
  ctx.globalCompositeOperation = 'destination-over'
  ctx.fillStyle = `rgba(${SHADOW.rgb[0]},${SHADOW.rgb[1]},${SHADOW.rgb[2]},${SHADOW.alpha})`
  for (const row of shadowRows(bx0, bx1, groundY, buildingHeight, Math.min(PAD, room))) {
    ctx.fillRect(row.x0, row.y, row.x1 - row.x0, 1)
  }
  ctx.restore()
}
