import { TILE } from '../model/palette'
import { BIOME_ID, TILE_ID } from '../model/terrain-ids'
import { ROCK, SHADOW, SNOW, type Rgb } from './art-palette'
import type { DecorRegion } from './decorations'

/**
 * Mountains drawn as one sculpted mass rather than sprites dropped on rock.
 *
 * Every rock or snow tile gets a height: how many tiles deep it sits inside its range. The heights
 * are interpolated between tile centres into a smooth relief, and every pixel is shaded like a
 * relief map lit from the north-west: the faces turned to the light are bright, the far faces
 * fall into cool shade, the crest between them carries a ridge line, each whole height is a
 * terrace, and the high core lies under snow. The range throws a flat shadow to the south-east.
 */

/** Deepest height counted: wide ranges keep rising to a crest instead of flattening out. */
export const MAX_HEIGHT = 14

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

/** Tones of one rock, from the face turned to the light to the deepest shade. */
interface Stone {
  ridge: Rgb
  lit: Rgb
  tread: Rgb
  mid: Rgb
  shade: Rgb
  deep: Rgb
}

const mix = (a: Rgb, b: Rgb, t: number): Rgb =>
  [0, 1, 2].map((c) => Math.round(a[c] + (b[c] - a[c]) * t)) as unknown as Rgb

const GRANITE: Stone = {
  ridge: mix(ROCK.lit, SNOW.lit, 0.35),
  lit: ROCK.lit,
  tread: mix(ROCK.lit, ROCK.mid, 0.4),
  mid: ROCK.mid,
  shade: ROCK.shade,
  deep: ROCK.deep,
}
/** Volcanic rock: the same light on dark basalt. */
const BASALT: Stone = {
  ridge: [128, 112, 100],
  lit: [108, 94, 86],
  tread: [92, 80, 73],
  mid: [74, 64, 59],
  shade: [52, 45, 42],
  deep: [37, 31, 29],
}
const SNOWCAP: Stone = {
  ridge: SNOW.lit,
  lit: SNOW.lit,
  tread: mix(SNOW.lit, SNOW.shade, 0.18),
  mid: mix(SNOW.lit, SNOW.shade, 0.4),
  shade: SNOW.shade,
  deep: mix(SNOW.shade, ROCK.shade, 0.35),
}

/** Height (on the interpolated relief) above which rock lies under snow. */
const SNOW_LINE = 9.5
/** How far (pixels) a range's cast shadow falls toward the bottom-right onto the lowland. */
export const MASS_SHADOW = 4
/** A mountain cell: the tile and the shadow strip right of it and below it. */
export const MASS_CELL = TILE + MASS_SHADOW
/** Slope toward the light (height per tile, along the light) past which a face is lit or shaded. */
const FACE = 0.35
const DEEP_FACE = 1.2
/**
 * The slope is read across this many pixels each way. Heights count tiles to the range's edge, so
 * they zigzag from tile to tile along a ragged edge; reading the slope over most of a tile keeps a
 * face in one tone instead of striping.
 */
const SLOPE_REACH = 3
/** How far below the range's edge corners the relief just off the range sits. */
const EDGE_DROP = 0.5

/**
 * Scratch: the relief at the 3x3 tile centres around the tile being painted, row-major from the
 * north-west, in half heights. Each is the mean height of that tile's own 3x3 (0 off the range,
 * at least a half on it), which rounds off the zigzag the tiles-deep count makes along a ragged edge.
 */
const near = new Uint8Array(9)

function rawAt(h: Uint8Array, width: number, height: number, x: number, y: number) {
  return x < 0 || y < 0 || x >= width || y >= height ? 0 : h[y * width + x]
}

function readNear(h: Uint8Array, width: number, height: number, x: number, y: number) {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = x + dx
      const cy = y + dy
      let relief = 0
      if (rawAt(h, width, height, cx, cy) > 0) {
        let sum = 0
        for (let ny = -1; ny <= 1; ny++)
          for (let nx = -1; nx <= 1; nx++) sum += rawAt(h, width, height, cx + nx, cy + ny)
        relief = Math.max(1, Math.round((sum * 2) / 9))
      }
      near[(dy + 1) * 3 + dx + 1] = relief
    }
  }
}

/** Relief (in heights) at the centre of the tile at offset (dx, dy) from the painted one, each in -1..1. */
const nearAt = (dx: number, dy: number) => near[(dy + 1) * 3 + dx + 1] / 2

/**
 * The relief at pixel (px, py) of the painted tile (its own pixels are 0..7): heights interpolated
 * between tile centres, so slopes run smoothly across tiles. Valid for pixels from -4 to 11, which
 * is all the painter reads.
 */
function reliefAt(px: number, py: number): number {
  const fx = (px + 0.5 - TILE / 2) / TILE
  const fy = (py + 0.5 - TILE / 2) / TILE
  const ix = Math.floor(fx)
  const iy = Math.floor(fy)
  const u = fx - ix
  const v = fy - iy
  let nw = nearAt(ix, iy)
  let ne = nearAt(ix + 1, iy)
  let sw = nearAt(ix, iy + 1)
  let se = nearAt(ix + 1, iy + 1)
  // Off the range, the relief carries on just below the range's own corners instead of dropping to
  // the lowland: a ragged edge would otherwise light up every notch. The edge gets its own lip and
  // cliff instead.
  const on = (nw > 0 ? 1 : 0) + (ne > 0 ? 1 : 0) + (sw > 0 ? 1 : 0) + (se > 0 ? 1 : 0)
  if (on > 0 && on < 4) {
    const rim = Math.max(0, (nw + ne + sw + se) / on - EDGE_DROP)
    if (nw === 0) nw = rim
    if (ne === 0) ne = rim
    if (sw === 0) sw = rim
    if (se === 0) se = rim
  }
  const top = nw * (1 - u) + ne * u
  const bottom = sw * (1 - u) + se * u
  return top * (1 - v) + bottom * v
}

/**
 * How steeply the ground at (px, py) rises toward the bottom-right, in height per tile: positive on
 * faces turned up to the light, negative on faces turned away from it.
 */
function slopeToLight(px: number, py: number): number {
  const ahead = reliefAt(px + SLOPE_REACH, py + SLOPE_REACH)
  const behind = reliefAt(px - SLOPE_REACH, py - SLOPE_REACH)
  return ((ahead - behind) * TILE) / (2 * SLOPE_REACH)
}

/** Whether pixel (px, py) (relative to the painted tile) lies on the mountain. */
const onMass = (px: number, py: number) => nearAt(Math.floor(px / TILE), Math.floor(py / TILE)) > 0

/** The terrace a relief height stands on: whole heights, so each tile centre sits mid-terrace. */
const terrace = (e: number) => Math.floor(e + 0.5)

/**
 * The colour of mountain pixel (px, py), lit from the north-west. Faces rising toward the
 * bottom-right look up into the light; faces falling toward it are in shade. Each whole height is
 * a terrace, its riser lit or shaded by which way it faces; the crest, where the lit face turns
 * to shade, carries a bright ridge line; the high core lies under snow.
 */
function massPixel(px: number, py: number, volcanic: boolean): Rgb {
  const e = reliefAt(px, py)
  const toLight = slopeToLight(px, py)
  const stone = volcanic ? BASALT : e >= SNOW_LINE ? SNOWCAP : GRANITE
  const level = terrace(e)
  const stepsDown =
    (onMass(px, py + 1) && terrace(reliefAt(px, py + 1)) < level) ||
    (onMass(px + 1, py) && terrace(reliefAt(px + 1, py)) < level)
  const stepsUp =
    (onMass(px, py - 1) && terrace(reliefAt(px, py - 1)) < level) ||
    (onMass(px - 1, py) && terrace(reliefAt(px - 1, py)) < level)
  // The range's own edge: a lip lit on the north-west, a cliff on the south-east.
  if (!onMass(px, py + 1) || !onMass(px + 1, py)) return stone.deep
  if (!onMass(px, py - 1) || !onMass(px - 1, py)) return stone.lit
  if (toLight >= FACE) {
    // The last lit pixel before the ground falls away beyond it.
    if (slopeToLight(px + 1, py + 1) < FACE && reliefAt(px + 4, py + 4) < reliefAt(px + 1, py + 1))
      return stone.ridge
    return stepsUp ? stone.lit : stone.tread
  }
  if (toLight <= -DEEP_FACE) return stepsDown ? stone.deep : stone.shade
  if (toLight <= -FACE) return stepsDown ? stone.shade : mix2(stone.mid, stone.shade)
  if (stepsDown) return stone.shade
  if (stepsUp) return stone.lit
  return stone.mid
}

const halfway = new Map<string, Rgb>()
function mix2(a: Rgb, b: Rgb): Rgb {
  const key = `${a}|${b}`
  let out = halfway.get(key)
  if (!out) {
    out = mix(a, b, 0.5)
    halfway.set(key, out)
  }
  return out
}

/**
 * Whether lowland pixel (px, py) (relative to the painted tile) lies in the shadow this tile casts:
 * the first mountain pixel up and to the left of it, within MASS_SHADOW, is on this tile. Every
 * shadowed pixel has exactly one such tile, so neighbouring tiles' shadows never overlap.
 */
function inCastShadow(px: number, py: number): boolean {
  if (onMass(px, py)) return false
  for (let t = 1; t <= MASS_SHADOW; t++) {
    const qx = px - t
    const qy = py - t
    if (!onMass(qx, qy)) continue
    return qx >= 0 && qy >= 0 && qx < TILE && qy < TILE
  }
  return false
}

const css = (rgb: Rgb) => `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`
const CAST_SHADOW = `rgba(${SHADOW.rgb.join(',')},${SHADOW.alpha})`

/**
 * Everything drawMassTile reads: the relief around the tile and whether it is volcanic. Tiles
 * with the same key paint the same pixels, so a sprite atlas can share one cell.
 */
export function massTileKey(
  h: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  volcanic: boolean,
): string {
  readNear(h, width, height, x, y)
  return `M|${near.join(',')}|${volcanic ? 1 : 0}`
}

/**
 * One tile of the mass with its top-left at (px, py), plus the cast shadow it throws on the lowland
 * to its right and below (up to MASS_SHADOW pixels past the tile).
 */
export function drawMassTile(
  ctx: CanvasRenderingContext2D,
  h: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  volcanic: boolean,
  /** Top-left of the tile; baking a tile into a sprite atlas passes its own origin. */
  px = x * TILE,
  py = y * TILE,
) {
  readNear(h, width, height, x, y)
  if (nearAt(0, 0) === 0) return
  for (let ty = 0; ty < MASS_CELL; ty++) {
    // Runs of one colour along the row become one rectangle.
    let runStart = 0
    let runStyle = ''
    for (let tx = 0; tx <= MASS_CELL; tx++) {
      let style = ''
      if (tx < MASS_CELL) {
        if (tx < TILE && ty < TILE) style = css(massPixel(tx, ty, volcanic))
        else if (inCastShadow(tx, ty)) style = CAST_SHADOW
      }
      if (style === runStyle) continue
      if (runStyle) {
        ctx.fillStyle = runStyle
        ctx.fillRect(px + runStart, py + ty, tx - runStart, 1)
      }
      runStart = tx
      runStyle = style
    }
  }
}

export function drawMountains(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  tiles: number[][],
  biomes?: number[][],
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
      drawMassTile(ctx, h, width, height, x, y, volcanic)
    }
  }
}
