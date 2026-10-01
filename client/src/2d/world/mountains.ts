import { TILE } from '../../world/palette'
import { BIOME_ID, TILE_ID } from '../../world/terrain-ids'
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
const SNOW_HEIGHT = 4

interface Ramp {
  shadow: string
  dark: string
  mid: string
  light: string
  glint: string
  edge: string
}

const ROCK: Ramp = {
  shadow: '#4b4640',
  dark: '#635c54',
  mid: '#7e766b',
  light: '#9d9488',
  glint: '#bab1a4',
  edge: '#332f2b',
}
const SNOW: Ramp = {
  shadow: '#93a3b1',
  dark: '#b3c1cc',
  mid: '#cfd9e1',
  light: '#e9eff3',
  glint: '#ffffff',
  edge: '#6f7f8c',
}
const BASALT: Ramp = {
  shadow: '#2e2624',
  dark: '#3d3330',
  mid: '#4f4440',
  light: '#655751',
  glint: '#7d6d65',
  edge: '#1f1918',
}

/** Rock, or snow lying on a mountain (next to rock), not a polar snowfield. */
function isHighAt(tiles: number[][], x: number, y: number) {
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
        for (const [dx, dy] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ]) {
          const nx = x + dx
          const ny = y + dy
          const n = nx < 0 || ny < 0 || nx >= width || ny >= height ? 0 : h[ny * width + nx]
          if (n < low) low = n
        }
        if (low + 1 < h[i]) h[i] = low + 1
      }
    }
  }
  return h
}

function at(h: Uint8Array, width: number, height: number, x: number, y: number) {
  return x < 0 || y < 0 || x >= width || y >= height ? 0 : h[y * width + x]
}

function pick(ramp: Ramp, level: number): string {
  if (level <= -2) return ramp.shadow
  if (level === -1) return ramp.dark
  if (level === 0) return ramp.mid
  if (level === 1) return ramp.light
  return ramp.glint
}

function drawMassTile(
  ctx: CanvasRenderingContext2D,
  h: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  tile: number,
  volcanic: boolean,
  hash: number,
) {
  const here = at(h, width, height, x, y)
  const px = x * TILE
  const py = y * TILE
  // Slope toward the light: positive when ground rises to the south-east,
  // i.e. this face looks north-west.
  const slope =
    at(h, width, height, x + 1, y) +
    at(h, width, height, x, y + 1) -
    at(h, width, height, x - 1, y) -
    at(h, width, height, x, y - 1)
  const level = Math.max(-2, Math.min(2, slope))
  // Snow follows height, so a range is white at its core, not its rim.
  const snowy = !volcanic && (here >= SNOW_HEIGHT || (tile === TILE_ID.SNOW && here >= 3))
  const ramp = volcanic ? BASALT : snowy ? SNOW : ROCK
  ctx.fillStyle = pick(ramp, level)
  ctx.fillRect(px, py, TILE, TILE)
  // A diagonal split shades each tile toward its lit corner, which keeps
  // the mass from reading as a grid of flat squares.
  ctx.fillStyle = pick(ramp, level - 1)
  for (let k = 0; k < TILE; k++) ctx.fillRect(px + TILE - 1 - k, py + k, k + 1 > 3 ? 2 : 1, 1)
  // Rock grain.
  const grain = pick(ramp, level + 1)
  ctx.fillStyle = grain
  ctx.fillRect(px + (hash & 7), py + ((hash >>> 3) & 7), 1, 1)
  ctx.fillRect(px + ((hash >>> 6) & 7), py + ((hash >>> 9) & 7), 2, 1)
  ctx.fillStyle = pick(ramp, level - 2)
  ctx.fillRect(px + ((hash >>> 12) & 7), py + ((hash >>> 15) & 7), 1, 1)

  // Where the range meets lower ground: a lit lip on the north, a dark
  // cliff with a cast shadow on the south, a shaded east flank.
  const north = at(h, width, height, x, y - 1)
  const south = at(h, width, height, x, y + 1)
  const east = at(h, width, height, x + 1, y)
  const west = at(h, width, height, x - 1, y)
  if (north === 0) {
    ctx.fillStyle = ramp.glint
    ctx.fillRect(px, py, TILE, 1)
  }
  if (west === 0) {
    ctx.fillStyle = pick(ramp, level + 1)
    ctx.fillRect(px, py, 1, TILE)
  }
  if (east === 0) {
    ctx.fillStyle = ramp.shadow
    ctx.fillRect(px + TILE - 1, py, 1, TILE)
  }
  if (south === 0) {
    ctx.fillStyle = ramp.edge
    ctx.fillRect(px, py + TILE - 2, TILE, 2)
    ctx.fillStyle = 'rgba(20,16,12,0.28)'
    ctx.fillRect(px, py + TILE, TILE, 3)
  }
}

/** A jagged crag, bottom-centre at (x, y). */
function drawCrag(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  ramp: Ramp,
  snowRamp: Ramp | null,
  hash: number,
) {
  const half = width / 2
  const top = y - height
  const snowLine = top + Math.round(height * 0.38)
  let leftJag = 0
  let rightJag = 0
  for (let row = 0; row < height; row++) {
    const ry = top + row
    // Each flank steps out at its own irregular rhythm.
    if (((hash >>> (row % 24)) & 3) === 0) leftJag = leftJag ? 0 : 1
    if (((hash >>> ((row + 7) % 24)) & 3) === 0) rightJag = rightJag ? 0 : 1
    const base = Math.round((row / height) * half)
    const lw = Math.max(1, base - leftJag)
    const rw = Math.max(1, base - rightJag)
    const capped = snowRamp && ry < snowLine
    const face = capped ? snowRamp : ramp
    ctx.fillStyle = face.light
    ctx.fillRect(Math.round(x) - lw, ry, lw, 1)
    ctx.fillStyle = face.dark
    ctx.fillRect(Math.round(x), ry, rw, 1)
    ctx.fillStyle = ramp.edge
    ctx.fillRect(Math.round(x) - lw - 1, ry, 1, 1)
    ctx.fillRect(Math.round(x) + rw, ry, 1, 1)
  }
  // Ridge line catching the light down the sunlit face.
  ctx.fillStyle = (snowRamp ?? ramp).glint
  for (let row = 1; row < height * 0.5; row += 2)
    ctx.fillRect(Math.round(x) - Math.round(row * 0.3) - 1, top + row, 1, 1)
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
    const row = tiles[y]
    if (!row) continue
    for (let x = xStart; x <= xEnd; x++) {
      if (h[y * width + x] === 0 || !inRegion(x, y, 1)) continue
      const volcanic = biomes?.[y]?.[x] === BIOME_ID.VOLCANIC
      drawMassTile(ctx, h, width, height, x, y, row[x], volcanic, landscapeHash(x + originX, y + originY))
    }
  }

  // Crags on the range's high points, back to front.
  const crags: {
    x: number
    y: number
    w: number
    ht: number
    volcanic: boolean
    snow: boolean
    hash: number
  }[] = []
  for (let y = yStart; y <= yEnd; y++) {
    for (let x = xStart; x <= xEnd; x++) {
      const here = h[y * width + x]
      if (here < 3 || !inRegion(x, y, 4)) continue
      let peak = true
      for (let dy = -1; dy <= 1 && peak; dy++)
        for (let dx = -1; dx <= 1; dx++) if (at(h, width, height, x + dx, y + dy) > here) peak = false
      if (!peak) continue
      const hash = landscapeHash(x + originX, y + originY)
      // Broad plateaus share a few crags rather than one per tile.
      if ((hash & 0xff) / 255 > 0.3) continue
      const volcanic = biomes?.[y]?.[x] === BIOME_ID.VOLCANIC
      const w = Math.round(TILE * (1.4 + here * 0.45 + ((hash >>> 8) & 0xff) / 512))
      crags.push({
        x: x * TILE + TILE / 2 + (((hash >>> 16) & 7) - 3),
        y: y * TILE + TILE,
        w,
        ht: Math.round(w * (0.75 + ((hash >>> 20) & 0xff) / 900)),
        volcanic,
        snow: !volcanic && here >= SNOW_HEIGHT,
        hash,
      })
    }
  }
  crags.sort((a, b) => a.y - b.y || a.x - b.x)
  for (const c of crags) {
    const ramp = c.volcanic ? BASALT : ROCK
    drawCrag(ctx, c.x, c.y, c.w, c.ht, ramp, c.snow ? SNOW : null, c.hash)
  }
}
