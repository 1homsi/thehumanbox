import { BIOME_ID, TILE_ID } from '../model/terrain-ids'
import { permanentWaterDepth } from '../model/terrain-visuals'
import { OCEAN, ROCK, SAND, SNOW, hex, type Rgb } from './art-palette'

/** The sea's depth bands, deepest first. A band is one flat colour, like the tints of a sea chart. */
export const OCEAN_BANDS: readonly Rgb[] = [OCEAN.abyss, OCEAN.deep, OCEAN.open, OCEAN.shelf, OCEAN.shallows]
/** Wire depth where each band above the abyss begins. */
const BAND_FLOORS = [40, 95, 140, 178]
export const SHALLOWS_BAND = OCEAN_BANDS.length - 1

/** The band of a wire depth (0 is deep ocean, 200 the shoreline): 0 is the abyss, SHALLOWS_BAND the shallows. */
export function oceanBand(wireDepth: number): number {
  let band = 0
  while (band < BAND_FLOORS.length && wireDepth >= BAND_FLOORS[band]) band++
  return band
}

/**
 * The colour of sea at this wire depth: its band's flat colour. Shared between calls, so callers must
 * not modify it.
 */
export function oceanColor(wireDepth: number): Rgb {
  return OCEAN_BANDS[oceanBand(wireDepth)]
}

/**
 * How fast the sea shelves up from the world's edge, in wire depth per tile. The edge tile itself is
 * abyss, the colour past the map, so land near the edge still leaves no visible rectangle.
 */
const EDGE_DEPTH_STEP = 24

/** The wire depth of the sea with the world's edge falling away to the abyss. */
export function seaDepthAt(
  wireDepth: number,
  row: number,
  col: number,
  width: number,
  height: number,
): number {
  const edge = Math.min(row, col, height - 1 - row, width - 1 - col)
  const floor = edge * EDGE_DEPTH_STEP
  return wireDepth < floor ? wireDepth : floor
}

/**
 * Rivers, lakes and ponds keep one shallow depth in the simulation (0.08, wire 184; see the sea depth
 * in worldgen.rs). Open sea crosses that value only on a gradient, so a water tile at exactly that depth
 * whose water neighbours are not a step or two away from it is fresh water.
 */
const FRESH_WIRE_DEPTH = 184
const SEA_GRADIENT_NEAR = 10

export function isFreshWaterAt(
  tiles: number[][],
  depth: number[][] | undefined,
  row: number,
  col: number,
): boolean {
  const depthRow = depth?.[row]
  if (!depthRow || depthRow[col] !== FRESH_WIRE_DEPTH || tiles[row]?.[col] !== TILE_ID.WATER) return false
  return (
    !nearSeaGradient(tiles, depth, row - 1, col) &&
    !nearSeaGradient(tiles, depth, row + 1, col) &&
    !nearSeaGradient(tiles, depth, row, col - 1) &&
    !nearSeaGradient(tiles, depth, row, col + 1)
  )
}

function nearSeaGradient(tiles: number[][], depth: number[][], row: number, col: number): boolean {
  if (tiles[row]?.[col] !== TILE_ID.WATER) return false
  const d = depth[row]?.[col]
  return d !== undefined && d !== FRESH_WIRE_DEPTH && Math.abs(d - FRESH_WIRE_DEPTH) <= SEA_GRADIENT_NEAR
}

/**
 * The depth band of open sea at (row, col), or -1 for land, floodwater and fresh water. Missing or
 * unknown depths count as shallows, like new water the simulation has not measured.
 */
export function seaBandAt(
  tiles: number[][],
  depth: number[][] | undefined,
  row: number,
  col: number,
): number {
  const tileRow = tiles[row]
  if (tileRow?.[col] !== TILE_ID.WATER) return -1
  if (isFreshWaterAt(tiles, depth, row, col)) return -1
  const wire = permanentWaterDepth(TILE_ID.WATER, depth?.[row]?.[col]) ?? 200
  return oceanBand(seaDepthAt(wire, row, col, tileRow.length, tiles.length))
}

/** Bank and rim of a beach: the bank is the strip of land on the water, the rim its lit edge. */
export function shorelineColors(tile: number, biome: number): readonly [string, string] {
  if (tile === TILE_ID.SNOW || biome === BIOME_ID.TUNDRA) return [SNOW_BANK, SNOW_RIM]
  if (tile === TILE_ID.ROCK || biome === BIOME_ID.VOLCANIC) return [ROCK_BANK, ROCK_RIM]
  if (biome === BIOME_ID.WETLAND) return [MUD_BANK, MUD_RIM]
  return [SAND_BANK, SAND_RIM]
}
const SNOW_BANK = hex(SNOW.shade)
const SNOW_RIM = hex(SNOW.lit)
const ROCK_BANK = hex(ROCK.shade)
const ROCK_RIM = hex(ROCK.mid)
const MUD_BANK = hex([110, 106, 74])
const MUD_RIM = hex([146, 140, 98])
const SAND_BANK = hex(SAND.wet)
const SAND_RIM = hex(SAND.light)

/** The simulation uses ecological phase names; older snapshots use calendar seasons. */
export function vegetationSeason(season: string): string {
  return (
    (
      {
        recovery: 'spring',
        abundance: 'summer',
        decline: 'autumn',
        scarcity: 'winter',
        hard_winter: 'winter',
      } as Record<string, string>
    )[season] ?? season
  )
}

/** Integer multiplication preserves random low bits even at large world coordinates. */
export function landscapeHash(x: number, y: number): number {
  let hash = Math.imul(x, 374761393) ^ Math.imul(y, 668265263)
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177)
  return (hash ^ (hash >>> 16)) >>> 0
}
