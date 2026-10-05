import { TILE_ID, isPermanentWaterTile, isWaterTile } from '../../model/terrain-ids'
import { baseTerrainTile, permanentWaterDepth } from '../../model/terrain-visuals'
import { oceanColor } from '../landscape-style'
import { TILE_RGB, BIOME_RGBA, SEASON_LAND_TINT } from '../../model/palette'
import { macroNoise, macroNoiseFine } from './noise'

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
  const biomeRow = biomes?.[row]
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
    const bm = biomeRow?.[col] ?? 0
    const bo = BIOME_RGBA[bm]
    if (bo) {
      const a = bo[3]
      if (a > 0) {
        const ia = 1 - a
        r = (r * ia + bo[0] * a) | 0
        g = (g * ia + bo[1] * a) | 0
        b = (b * ia + bo[2] * a) | 0
      }
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
