import { TILE_ID, isPermanentWaterTile, isWaterTile } from '../../model/terrain-ids'
import { baseTerrainTile } from '../../model/terrain-visuals'
import { OCEAN_BANDS, seaBandAt } from '../landscape-style'
import { FRESH_WATER, type Rgb } from '../art-palette'
import { dryNoise } from './noise'
import { groundTone } from './ground-palette'

/**
 * The biome a cell is painted as: its own, unless it is a speck (one or two cells) of another biome inside a
 * field where six or more of its eight neighbours share one biome; then it takes theirs. The biome grid has
 * single cells of jungle in a savanna or wetland on a beach, and painted one tile at a time they made the
 * ground a patchwork of 8-pixel squares (#883).
 */
export function paintedBiome(biomes: ArrayLike<number>[] | undefined, row: number, col: number): number {
  const own = biomes?.[row]?.[col] ?? 0
  if (!biomes) return own
  let other = -1
  let n = 0
  let same = 0
  for (let dr = -1; dr <= 1; dr++) {
    const r = biomes[row + dr]
    if (!r) continue
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue
      const b = r[col + dc]
      if (b === undefined) continue
      if (b === own) same++
      else if (other === -1 || b === other) {
        other = b
        n++
      }
    }
  }
  return same <= 1 && n >= 6 ? other : own
}

/**
 * One tile's flat colour: the sea's depth band, fresh water, or the ground of the tile's biome in this
 * season. Writes `[r, g, b, 0]` into `out` (the fourth slot was a shade of noise added to every pixel;
 * the ground has none now) and returns the base terrain id the surface marks are chosen by. Shared by
 * the 2D fallback and the TileLayer terrain, so both colour the ground identically.
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

  // Land is one flat palette colour: its biome's ground, or the tone of the biome's patches where the
  // patch noise runs high. No tint, no blend and no shade of noise (see ground-palette.ts).
  const biome = isWater ? 0 : paintedBiome(biomes, row, col)
  // Patches are clumps a handful of tiles across: big enough to read as a change in the land, small enough
  // that no stretch of ground is one flat fill.
  const patch = tid === TILE_ID.GRASS && dryNoise.at(col / 9 + 31, row / 9 + 17) > 0.66
  const rgb = groundTone(tid, biome, season, patch)
  out[0] = rgb[0]
  out[1] = rgb[1]
  out[2] = rgb[2]
  out[3] = 0
  return tid
}
