import { TILE } from '../model/palette'
import { BIOME_ID, TILE_ID } from '../model/terrain-ids'
import { landscapeHash } from './landscape-style'
import type { DecorRegion } from './decorations'

/**
 * Mountains drawn as one sculpted mass rather than sprites dropped on rock.
 *
 * Every rock or snow tile gets a height: how many tiles deep it sits inside
 * its range. The mass is shaded like a relief map lit from the north-west
 * (slopes facing the light are bright, the far side falls into shadow), the
 * high core turns to snow, and the edge where a range meets the lowland
 * gets a dark cliff so it reads as raised ground. Jagged crags then rise only
 * on the range's high points.
 */

const MAX_HEIGHT = 6
/** Height (tiles deep) where rock gives way to snow. */
const SNOW_HEIGHT = 6

/** Rock, or snow lying on a mountain (next to rock), not a polar snowfield. */
export function isHighAt(tiles: number[][], x: number, y: number) {
  const t = tiles[y]?.[x]
  if (t === TILE_ID.ROCK) return true
  if (t !== TILE_ID.SNOW) return false
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++) if (tiles[y + dy]?.[x + dx] === TILE_ID.ROCK) return true
  return false
}

/**
 * Tiles-deep distance inside each mountain mass, capped at MAX_HEIGHT.
 * Computed by repeated erosion, which is exact within the cap.
 */
export function mountainHeights(
  tiles: number[][],
  width: number,
  height: number,
  window?: DecorRegion,
): Uint8Array {
  // A window bigger than the cap on every side gives exact heights inside
  // it, so region repaints don't recompute the whole map.
  const pad = MAX_HEIGHT + 2
  const x0 = window ? Math.max(0, window.x0 - pad) : 0
  const y0 = window ? Math.max(0, window.y0 - pad) : 0
  const x1 = window ? Math.min(width - 1, window.x1 + pad) : width - 1
  const y1 = window ? Math.min(height - 1, window.y1 + pad) : height - 1
  const h = new Uint8Array(width * height)
  for (let y = y0; y <= y1; y++) {
    const row = tiles[y]
    if (!row) continue
    for (let x = x0; x <= x1; x++) if (isHighAt(tiles, x, y)) h[y * width + x] = MAX_HEIGHT
  }
  for (let pass = 0; pass < MAX_HEIGHT; pass++) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * width + x
        if (h[i] === 0) continue
        let low = MAX_HEIGHT
        const west = x <= 0 ? 0 : h[i - 1]
        if (west < low) low = west
        const east = x + 1 >= width ? 0 : h[i + 1]
        if (east < low) low = east
        const north = y <= 0 ? 0 : h[i - width]
        if (north < low) low = north
        const south = y + 1 >= height ? 0 : h[i + width]
        if (south < low) low = south
        if (low + 1 < h[i]) h[i] = low + 1
      }
    }
  }
  return h
}

function at(h: Uint8Array, width: number, height: number, x: number, y: number) {
  return x < 0 || y < 0 || x >= width || y >= height ? 0 : h[y * width + x]
}

/** Terrace colours by height level, lowest first. */
const ROCK_LEVELS = ['#5f5850', '#6e665c', '#7c7368', '#8a8075', '#978d81', '#a39a8e']
const SNOW_LEVELS = ['#b9c6d0', '#cdd7df', '#dfe7ed', '#eef3f6']
const BASALT_LEVELS = ['#3a302d', '#443935', '#4e423d', '#584b45', '#61534c', '#6a5b53']

function levelColor(here: number, snowy: boolean, volcanic: boolean): string {
  if (volcanic) return BASALT_LEVELS[Math.min(here, BASALT_LEVELS.length) - 1]
  if (snowy) return SNOW_LEVELS[Math.min(here - SNOW_HEIGHT, SNOW_LEVELS.length - 1)]
  return ROCK_LEVELS[Math.min(here, ROCK_LEVELS.length) - 1]
}

/**
 * One tile of the mass, drawn as a terrace: a flat shelf for its height,
 * the dark face of the step above it showing along its top, a lit lip
 * where it rises above its neighbour, and a cliff onto the lowland.
 */
function drawMassTile(
  ctx: CanvasRenderingContext2D,
  h: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  volcanic: boolean,
  hash: number,
) {
  const here = at(h, width, height, x, y)
  const px = x * TILE
  const py = y * TILE
  const snowy = !volcanic && here >= SNOW_HEIGHT
  ctx.fillStyle = levelColor(here, snowy, volcanic)
  ctx.fillRect(px, py, TILE, TILE)
  // Break up wide shelves: some tiles sit a shade lighter or darker.
  const jitter = (hash >>> 18) & 3
  if (jitter === 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.07)'
    ctx.fillRect(px, py, TILE, TILE)
  } else if (jitter === 1) {
    ctx.fillStyle = 'rgba(255,255,255,0.06)'
    ctx.fillRect(px, py, TILE, TILE)
  }
  // Strata: short darker dashes, as layered rock seen side-on.
  if (!snowy) {
    ctx.fillStyle = 'rgba(0,0,0,0.13)'
    ctx.fillRect(px + (hash & 3), py + 2 + ((hash >>> 2) & 1), 3 + ((hash >>> 4) & 1), 1)
    ctx.fillRect(px + 3 + ((hash >>> 5) & 3), py + 5 + ((hash >>> 7) & 1), 2 + ((hash >>> 8) & 1), 1)
    ctx.fillStyle = 'rgba(255,255,255,0.09)'
    ctx.fillRect(px + ((hash >>> 9) & 7), py + 1 + ((hash >>> 12) & 1), 2, 1)
  } else {
    ctx.fillStyle = 'rgba(120,140,160,0.18)'
    ctx.fillRect(px + ((hash >>> 6) & 7), py + 3 + ((hash >>> 9) & 3), 2, 1)
  }

  const north = at(h, width, height, x, y - 1)
  const south = at(h, width, height, x, y + 1)
  const west = at(h, width, height, x - 1, y)
  const east = at(h, width, height, x + 1, y)
  if (north > here) {
    // We look at the range from the south, so a higher shelf behind this
    // one shows its face: a darker band along this tile's top.
    ctx.fillStyle = volcanic ? '#2a2220' : snowy ? '#9eadb9' : '#4c463f'
    ctx.fillRect(px, py, TILE, 3)
    ctx.fillStyle = 'rgba(0,0,0,0.18)'
    ctx.fillRect(px, py + 3, TILE, 1)
  } else if (north < here) {
    ctx.fillStyle = 'rgba(255,255,255,0.22)'
    ctx.fillRect(px, py, TILE, 1)
  }
  if (west < here) {
    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    ctx.fillRect(px, py, 1, TILE)
  }
  if (east < here) {
    ctx.fillStyle = 'rgba(0,0,0,0.16)'
    ctx.fillRect(px + TILE - 1, py, 1, TILE)
  }
  if (south === 0) {
    // The range's outer cliff, with its shadow falling on the lowland.
    ctx.fillStyle = volcanic ? '#221b19' : '#3e3832'
    ctx.fillRect(px, py + TILE - 3, TILE, 3)
    ctx.fillStyle = 'rgba(20,16,12,0.3)'
    ctx.fillRect(px, py + TILE, TILE, 2)
  }
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
  const h = mountainHeights(tiles, width, height, only)
  const inRegion = (x: number, y: number, pad: number) =>
    !only || (x >= only.x0 - pad && x <= only.x1 + pad && y >= only.y0 - pad && y <= only.y1 + pad)

  const yStart = only ? Math.max(0, only.y0 - 5) : 0
  const yEnd = only ? Math.min(height - 1, only.y1 + 5) : height - 1
  const xStart = only ? Math.max(0, only.x0 - 5) : 0
  const xEnd = only ? Math.min(width - 1, only.x1 + 5) : width - 1
  for (let y = yStart; y <= yEnd; y++) {
    for (let x = xStart; x <= xEnd; x++) {
      if (h[y * width + x] === 0 || !inRegion(x, y, 1)) continue
      const volcanic = biomes?.[y]?.[x] === BIOME_ID.VOLCANIC
      drawMassTile(ctx, h, width, height, x, y, volcanic, landscapeHash(x + originX, y + originY))
    }
  }
}
