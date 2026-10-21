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
 * The last step of a building sprite, over what the painter drew: the colours go earthy, the outer edge
 * becomes the warm ink, and a flat cast shadow lies under it to the bottom-right. Done on pixels because
 * ~200 painters share it; the sprite is cached, so this runs once per look, not per frame.
 */
export function finishSprite(ctx: CanvasRenderingContext2D, width: number, height: number, kind: string) {
  const groundY = height - PAD_BOT
  const img = ctx.getImageData(0, 0, width, height)
  const d = img.data
  const solid = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height && d[(y * width + x) * 4 + 3] >= SOLID
  const edge = new Uint8Array(width * height)
  let bx0 = width
  let bx1 = -1
  let top = height
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!solid(x, y)) continue
      if (!solid(x - 1, y) || !solid(x + 1, y) || !solid(x, y - 1) || !solid(x, y + 1))
        edge[y * width + x] = 1
      if (y < groundY && y >= groundY - 4) {
        if (x < bx0) bx0 = x
        if (x > bx1) bx1 = x
      }
      if (y < top) top = y
    }
  }
  for (let i = 0, n = width * height; i < n; i++) {
    const o = i * 4
    if (d[o + 3] === 0) continue
    const [r, g, b] = earthy(d[o], d[o + 1], d[o + 2])
    if (edge[i]) {
      d[o] = Math.round(r + (INK[0] - r) * EDGE_INK)
      d[o + 1] = Math.round(g + (INK[1] - g) * EDGE_INK)
      d[o + 2] = Math.round(b + (INK[2] - b) * EDGE_INK)
    } else {
      d[o] = r
      d[o + 1] = g
      d[o + 2] = b
    }
  }
  ctx.putImageData(img, 0, 0)

  const buildingHeight = groundY - top
  if (bx1 < 0 || buildingHeight < 7 || FLAT_KINDS.has(kind)) return
  const room = width - 1 - bx1
  ctx.save()
  ctx.globalCompositeOperation = 'destination-over'
  ctx.fillStyle = `rgba(${SHADOW.rgb[0]},${SHADOW.rgb[1]},${SHADOW.rgb[2]},${SHADOW.alpha})`
  for (const row of shadowRows(bx0, bx1, groundY, buildingHeight, Math.min(PAD, room))) {
    ctx.fillRect(row.x0, row.y, row.x1 - row.x0, 1)
  }
  ctx.restore()
}
