import { TILE } from '../../world/palette'
import { BIOME_ID, TILE_ID } from '../../world/terrain-ids'
import { landscapeHash } from './landscape-style'
import type { DecorRegion } from './decorations'

/**
 * Pixel-art mountain peaks drawn over rock tiles in the baked terrain layer.
 * Each peak rises above its tile with a lit west face, a shaded east face
 * and a snowcap on high ground, and peaks are painted top to bottom so
 * nearer ones overlap farther ones, like a range seen from above.
 */

interface Palette {
  lit: string
  shade: string
  edge: string
  snowLit: string
  snowShade: string
}

const STONE: Palette = {
  lit: '#a39b90',
  shade: '#6f6860',
  edge: '#4a4540',
  snowLit: '#f4f7fa',
  snowShade: '#c3cfd9',
}
const ASH: Palette = {
  lit: '#7a645b',
  shade: '#4f3f3a',
  edge: '#332824',
  snowLit: '#9c8a80',
  snowShade: '#6e5c54',
}

interface Peak {
  /** Bottom-centre of the peak in canvas pixels. */
  x: number
  y: number
  width: number
  height: number
  snow: number
  palette: Palette
}

function isHigh(t: number | undefined) {
  return t === TILE_ID.ROCK || t === TILE_ID.SNOW
}

/** How much of the 3x3 neighbourhood is high ground (0..9). */
function massAround(tiles: number[][], x: number, y: number) {
  let n = 0
  for (let dy = -1; dy <= 1; dy++) {
    const row = tiles[y + dy]
    if (!row) continue
    for (let dx = -1; dx <= 1; dx++) if (isHigh(row[x + dx])) n++
  }
  return n
}

export function collectPeaks(
  width: number,
  height: number,
  tiles: number[][],
  biomes: number[][] | undefined,
  originX = 0,
  originY = 0,
  only?: DecorRegion,
): Peak[] {
  const peaks: Peak[] = []
  // Peaks reach up to three tiles above their base, so a region repaint
  // must include peaks anchored just below it.
  const reach = 5
  for (let y = 0; y < height; y++) {
    if (only && (y < only.y0 - 1 || y > only.y1 + reach)) continue
    const row = tiles[y]
    if (!row) continue
    for (let x = 0; x < width; x++) {
      if (only && (x < only.x0 - 2 || x > only.x1 + 2)) continue
      const t = row[x]
      if (!isHigh(t)) continue
      const mass = massAround(tiles, x, y)
      // Lone rocks stay as ground stones; peaks need a mountain around them.
      if (mass < 4) continue
      const hash = landscapeHash(x + originX, y + originY)
      const r0 = (hash & 0xff) / 255
      const r1 = ((hash >>> 8) & 0xff) / 255
      const r2 = ((hash >>> 16) & 0xff) / 255
      // Thin the field so peaks don't stack into a solid wall.
      if (r0 > 0.08 + mass * 0.012) continue
      const core = mass >= 8
      const width = Math.round(TILE * (core ? 2.8 + r1 * 1.6 : 1.8 + r1 * 1.0))
      const height = Math.round(width * (0.7 + r2 * 0.35))
      // Only real summits carry snow; the rest of the range stays bare rock.
      const snowy = t === TILE_ID.SNOW || (core && r2 > 0.82)
      const volcanic = biomes?.[y]?.[x] === BIOME_ID.VOLCANIC
      peaks.push({
        x: x * TILE + TILE / 2 + Math.round((r2 - 0.5) * TILE * 0.5),
        y: y * TILE + TILE,
        width,
        height,
        snow: snowy ? 0.32 + r1 * 0.12 : 0,
        palette: volcanic ? ASH : STONE,
      })
    }
  }
  peaks.sort((a, b) => a.y - b.y || a.x - b.x)
  return peaks
}

function drawPeak(ctx: CanvasRenderingContext2D, p: Peak) {
  const half = p.width / 2
  const top = p.y - p.height
  const snowLine = top + p.height * p.snow
  for (let row = 0; row < p.height; row++) {
    const y = top + row
    // Half-width grows down the slope, with a notch every few rows so the
    // faces read as rock rather than a perfect triangle.
    const notch = row % 5 === 3 ? 1 : 0
    const w = Math.max(1, Math.round((row / p.height) * half) - notch)
    const left = Math.round(p.x - w)
    const capped = y < snowLine
    ctx.fillStyle = capped ? p.palette.snowLit : p.palette.lit
    ctx.fillRect(left, y, w, 1)
    ctx.fillStyle = capped ? p.palette.snowShade : p.palette.shade
    ctx.fillRect(Math.round(p.x), y, w, 1)
    // Dark outline down both flanks.
    ctx.fillStyle = p.palette.edge
    ctx.fillRect(left - 1, y, 1, 1)
    ctx.fillRect(Math.round(p.x) + w, y, 1, 1)
  }
  // Ridge line down the middle of the shaded face, and a grounded base.
  ctx.fillStyle = p.palette.edge
  ctx.fillRect(Math.round(p.x - half), p.y - 1, Math.round(p.width), 1)
}

export function drawMountains(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  tiles: number[][],
  biomes?: number[][],
  originX = 0,
  originY = 0,
  only?: DecorRegion,
) {
  const peaks = collectPeaks(width, height, tiles, biomes, originX, originY, only)
  for (const peak of peaks) drawPeak(ctx, peak)
}
