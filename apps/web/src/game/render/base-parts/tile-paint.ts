import { TILE_ID, isPermanentWaterTile, isWaterTile } from '../../model/terrain-ids'
import { baseTerrainTile, permanentWaterDepth } from '../../model/terrain-visuals'
import { oceanColor } from '../landscape-style'
import { TILE_RGB, BIOME_RGBA, SEASON_LAND_TINT } from '../../model/palette'
import { biomePatchNoise, macroNoise, macroNoiseFine } from './noise'

export function varAmountForTile(tid: number): number {
  if (tid === 2 || tid === 9) return 2
  if (tid === 1 || tid === 3) return 2
  if (tid === 5) return 3
  if (tid === 6) return 9
  if (tid === 12) return 3
  if (tid === 13) return 2
  return 4
}

/**
 * How much each cell of the biome kernel counts, centre first. Every cell takes the overlay of its
 * own biome and of the eight around it, so a border between two biomes fades over about three
 * cells instead of a hard line. The weights sum to 16.
 */
const BIOME_KERNEL: ReadonlyArray<readonly [number, number, number]> = [
  [-1, -1, 1],
  [0, -1, 2],
  [1, -1, 1],
  [-1, 0, 2],
  [0, 0, 4],
  [1, 0, 2],
  [-1, 1, 1],
  [0, 1, 2],
  [1, 1, 1],
]
const BIOME_KERNEL_WEIGHT = 16

/** Scratch for `biomeOverlayAt`: r, g, b and the alpha of the blended overlay. */
const biomeScratch = new Float64Array(4)

/**
 * The blended biome overlay at (row, col), written into `out` as `[r, g, b, a]`. Edges of the grid
 * count their own biome for the cells that fall outside it, so the map border does not fade. Where
 * all nine cells share one biome this is that biome's overlay exactly (before the patch noise).
 * Neighbouring biome patches vary the strength by a slow noise so big areas are not one flat tint.
 */
export function biomeOverlayAt(
  out: Float64Array,
  biomes: number[][] | undefined,
  row: number,
  col: number,
): void {
  const own = biomes?.[row]?.[col] ?? 0
  let alpha = 0
  let rSum = 0
  let gSum = 0
  let bSum = 0
  for (const [dc, dr, w] of BIOME_KERNEL) {
    const v = biomes?.[row + dr]?.[col + dc]
    const bo = BIOME_RGBA[v === undefined ? own : v]
    if (!bo || bo[3] <= 0) continue
    const wa = w * bo[3]
    alpha += wa
    rSum += wa * bo[0]
    gSum += wa * bo[1]
    bSum += wa * bo[2]
  }
  if (alpha <= 0) {
    out[3] = 0
    return
  }
  const strength = 0.8 + biomePatchNoise.at(col / 70, row / 70) * 0.4
  out[0] = rSum / alpha
  out[1] = gSum / alpha
  out[2] = bSum / alpha
  out[3] = (alpha / BIOME_KERNEL_WEIGHT) * strength
}

/**
 * One tile's flat colour before the per-pixel texture: the tile id's colour, ocean depth, the
 * shallow-edge mix, the biome blend, macro noise shading and the season's land tint. Writes
 * `[r, g, b, shading]` into `out` (r, g, b are unclamped integers; `shading` is added to every
 * channel of every pixel) and returns the base terrain id the texture is chosen by. Shared by the
 * 2D fallback and the TileLayer terrain, so both colour the ground identically.
 */
export function tileColor(
  out: Int32Array,
  tiles: number[][],
  biomes: number[][] | undefined,
  depth_map: number[][] | undefined,
  season: string | undefined,
  row: number,
  col: number,
): number {
  const height = tiles.length
  const tileRow = tiles[row]
  const depthRow = depth_map?.[row]
  const tileRowPrev = row > 0 ? tiles[row - 1] : undefined
  const tileRowNext = row + 1 < height ? tiles[row + 1] : undefined
  const rawTid = tileRow?.[col] ?? TILE_ID.VOID
  const tid = baseTerrainTile(rawTid)
  const rgb = TILE_RGB[tid] ?? TILE_RGB[0]
  let r = rgb[0]
  let g = rgb[1]
  let b = rgb[2]

  const isWater = isWaterTile(rawTid)
  const isPermanentWater = isPermanentWaterTile(rawTid)
  const wN = tileRowPrev?.[col]
  const wS = tileRowNext?.[col]
  const wW = col > 0 ? tileRow?.[col - 1] : undefined
  const wE = tileRow?.[col + 1]
  const touchesLand =
    (wN !== undefined && !isWaterTile(wN)) ||
    (wS !== undefined && !isWaterTile(wS)) ||
    (wW !== undefined && !isWaterTile(wW)) ||
    (wE !== undefined && !isWaterTile(wE))

  const visualDepth = permanentWaterDepth(rawTid, depthRow?.[col])
  if (visualDepth !== null) {
    const ocean = oceanColor(visualDepth)
    r = ocean[0]
    g = ocean[1]
    b = ocean[2]
  }

  if (isPermanentWater && touchesLand) {
    r = (r * 0.68 + SHALLOW_RGB[0] * 0.32) | 0
    g = (g * 0.68 + SHALLOW_RGB[1] * 0.32) | 0
    b = (b * 0.68 + SHALLOW_RGB[2] * 0.32) | 0
  }

  if (!isWater && tid !== TILE_ID.ROCK && tid !== TILE_ID.SNOW) {
    biomeOverlayAt(biomeScratch, biomes, row, col)
    const a = biomeScratch[3]
    if (a > 0) {
      const ia = 1 - a
      r = (r * ia + biomeScratch[0] * a) | 0
      g = (g * ia + biomeScratch[1] * a) | 0
      b = (b * ia + biomeScratch[2] * a) | 0
    }
  }

  const macro =
    macroNoise.at(col / 42, row / 42) * 0.65 + macroNoiseFine.at(col / 13 + 7, row / 13 + 7) * 0.35
  let shading = ((macro - 0.5) * (isWater ? 5 : 25)) | 0
  if (!isWater) {
    const grassy = tid === 1 || tid === 3 || tid === 6 || tid === 13
    const landTint = SEASON_LAND_TINT[season ?? '']
    if (grassy && landTint) {
      let w = landTint.w * (0.55 + macro * 0.9)
      if (w > 0.85) w = 0.85
      const iw = 1 - w
      r = (r * iw + landTint.rgb[0] * w) | 0
      g = (g * iw + landTint.rgb[1] * w) | 0
      b = (b * iw + landTint.rgb[2] * w) | 0
      shading += ((macro - 0.5) * 8) | 0
    }
  }
  out[0] = r
  out[1] = g
  out[2] = b
  out[3] = shading
  return tid
}

export const SHALLOW_RGB: [number, number, number] = [116, 198, 208]
