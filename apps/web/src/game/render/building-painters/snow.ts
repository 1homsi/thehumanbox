import { mulberry32 } from './kit'

/** Snow on a roof: white on the top edge, a blue-grey shade just under it. */
export const SNOW_LIGHT = '#eef4f7'
export const SNOW_SHADE = '#b9cad6'

/** One pixel of snow. `shade` marks the lower row of a cap, which reads as depth. */
export interface SnowPixel {
  x: number
  y: number
  shade: boolean
}

/**
 * Where snow lies on a sprite's top edge, as pixels. In each column the cap starts on the
 * first opaque row (the roof's top edge, which the outline draws). A seeded hash gives each
 * column a depth of one, two or three rows, so the cap reads as drifts rather than a stripe;
 * the lowest row of a deep column is the shade. Pure (no canvas): `topOf(x)` is the first
 * opaque row of column x, or -1 for an empty column.
 */
export function snowCapPixels(width: number, topOf: (x: number) => number, seed: number): SnowPixel[] {
  const rng = mulberry32(seed)
  const out: SnowPixel[] = []
  for (let x = 0; x < width; x++) {
    const top = topOf(x)
    if (top < 0) continue
    const r = rng()
    const depth = r < 0.25 ? 1 : r < 0.75 ? 2 : 3
    out.push({ x, y: top, shade: false })
    if (depth >= 2) out.push({ x, y: top + 1, shade: false })
    if (depth === 3) out.push({ x, y: top + 2, shade: true })
  }
  return out
}

/**
 * Paints the snow cap over a sprite canvas, after its painter has drawn the building and before
 * the damage tint, so a damaged roof still looks worn. Only house-like sprites get snow.
 */
export function paintRoofSnow(ctx: CanvasRenderingContext2D, width: number, height: number, seed: number) {
  const data = ctx.getImageData(0, 0, width, height).data
  const topOf = (x: number) => {
    for (let y = 0; y < height; y++) if (data[(y * width + x) * 4 + 3] > 127) return y
    return -1
  }
  for (const p of snowCapPixels(width, topOf, seed)) {
    ctx.fillStyle = p.shade ? SNOW_SHADE : SNOW_LIGHT
    ctx.fillRect(p.x, p.y, 1, 1)
  }
}
