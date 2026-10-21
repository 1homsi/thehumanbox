import { BIOME_ID, TILE_ID, isPermanentWaterTile, isWaterTile } from '../../model/terrain-ids'
import { baseTerrainTile } from '../../model/terrain-visuals'
import { OCEAN_BANDS, seaBandAt } from '../landscape-style'
import { FRESH_WATER, GRASS, type Rgb } from '../art-palette'
import { TILE_RGB, BIOME_RGBA, SEASON_LAND_TINT } from '../../model/palette'
import { biomePatchNoise, dryNoise, macroNoise, macroNoiseFine } from './noise'

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
  const tileRowPrev = row > 0 ? tiles[row - 1] : undefined
  const tileRowNext = row + 1 < height ? tiles[row + 1] : undefined
  const rawTid = tileRow?.[col] ?? TILE_ID.VOID
  const tid = baseTerrainTile(rawTid)

  const isWater = isWaterTile(rawTid)
  if (isPermanentWaterTile(rawTid)) {
    // Water is flat: the sea in its chart band, rivers and lakes in fresh water, darker away from
    // the bank. The contours between bands and the surf are sprites over it (sea-chart.ts).
    const band = seaBandAt(tiles, depth_map, row, col)
    let rgb: Rgb
    if (band >= 0) rgb = OCEAN_BANDS[band]
    else {
      const wN = tileRowPrev?.[col]
      const wS = tileRowNext?.[col]
      const wW = col > 0 ? tileRow?.[col - 1] : undefined
      const wE = tileRow?.[col + 1]
      const touchesLand =
        (wN !== undefined && !isWaterTile(wN)) ||
        (wS !== undefined && !isWaterTile(wS)) ||
        (wW !== undefined && !isWaterTile(wW)) ||
        (wE !== undefined && !isWaterTile(wE))
      rgb = touchesLand ? FRESH_WATER.mid : FRESH_WATER.deep
    }
    out[0] = rgb[0]
    out[1] = rgb[1]
    out[2] = rgb[2]
    out[3] = 0
    return tid
  }

  const base = TILE_RGB[tid] ?? TILE_RGB[0]
  let r = base[0]
  let g = base[1]
  let b = base[2]
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
  if (tid === TILE_ID.GRASS) {
    // Open grass dries to ochre in patches; forest, jungle and wetland stay green.
    const biome = biomes?.[row]?.[col]
    if (biome === BIOME_ID.GRASSLAND || biome === BIOME_ID.SAVANNA) {
      const dry = dryNoise.at(col / 25 + 31, row / 25 + 17)
      if (dry > 0.55) {
        const w = dry > 0.8 ? 0.6 : (dry - 0.55) * 2.4
        r = (r + (GRASS.dry[0] - r) * w) | 0
        g = (g + (GRASS.dry[1] - g) * w) | 0
        b = (b + (GRASS.dry[2] - b) * w) | 0
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
