import { BIOME_ID, TILE_ID, isPermanentWaterTile, isWaterTile } from '../../model/terrain-ids'
import { baseTerrainTile } from '../../model/terrain-visuals'
import { OCEAN_BANDS, seaBandAt } from '../landscape-style'
import { FRESH_WATER, GRASS, type Rgb } from '../art-palette'
import { TILE_RGB, BIOME_RGBA, SEASON_LAND_TINT } from '../../model/palette'
import { dryNoise, macroNoise, macroNoiseFine } from './noise'

export function varAmountForTile(tid: number): number {
  if (tid === 2 || tid === 9) return 2
  if (tid === 1 || tid === 3) return 2
  if (tid === 5) return 3
  if (tid === 6) return 9
  if (tid === 12) return 3
  if (tid === 13) return 2
  return 4
}

/** Scratch for `biomeOverlayAt`: r, g, b and the alpha of the overlay. */
const biomeScratch = new Float64Array(4)

/**
 * The biome overlay at (row, col), written into `out` as `[r, g, b, a]`: the cell's own biome, flat. It used
 * to be blended with the eight cells around it, which faded a border over three tiles: blurred from afar and a
 * staircase of shaded squares up close. The border is now hard here and made ragged at the pixel level by the
 * fringe (`cf/ground/biome-fringe.ts`). Without a biome grid every cell is grassland.
 */
export function biomeOverlayAt(
  out: Float64Array,
  biomes: ArrayLike<number>[] | undefined,
  row: number,
  col: number,
): void {
  const own = biomes?.[row]?.[col] ?? 0
  const bo = BIOME_RGBA[own]
  if (!bo || bo[3] <= 0) {
    out[3] = 0
    return
  }
  out[0] = bo[0]
  out[1] = bo[1]
  out[2] = bo[2]
  out[3] = bo[3]
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
  tiles: ArrayLike<number>[],
  biomes: ArrayLike<number>[] | undefined,
  depth_map: ArrayLike<number>[] | undefined,
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
      // Two flat shades, not a gradient: a soft ramp across 8-pixel tiles reads as blotchy squares.
      const dry = dryNoise.at(col / 25 + 31, row / 25 + 17)
      if (dry > 0.62) {
        const w = 0.5
        r = (r + (GRASS.dry[0] - r) * w) | 0
        g = (g + (GRASS.dry[1] - g) * w) | 0
        b = (b + (GRASS.dry[2] - b) * w) | 0
      }
    }
  }

  // Broad light and shade in three flat steps rather than a smooth ramp: the ramp gave every 8-pixel tile its
  // own shade, and the ground read as soft blotchy squares instead of flat pixel-art fields.
  const macro =
    macroNoise.at(col / 42, row / 42) * 0.65 + macroNoiseFine.at(col / 13 + 7, row / 13 + 7) * 0.35
  const shading = isWater ? 0 : macro < 0.36 ? -5 : macro > 0.64 ? 5 : 0
  if (!isWater) {
    const grassy = tid === 1 || tid === 3 || tid === 6 || tid === 13
    const landTint = SEASON_LAND_TINT[season ?? '']
    if (grassy && landTint) {
      const w = Math.min(0.85, landTint.w)
      const iw = 1 - w
      r = (r * iw + landTint.rgb[0] * w) | 0
      g = (g * iw + landTint.rgb[1] * w) | 0
      b = (b * iw + landTint.rgb[2] * w) | 0
    }
  }
  out[0] = r
  out[1] = g
  out[2] = b
  out[3] = shading
  return tid
}
