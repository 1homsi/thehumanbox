import { BIOME_ID, TILE_ID } from '../model/terrain-ids'
import { permanentWaterDepth } from '../model/terrain-visuals'
import { OCEAN, ROCK, SAND, SNOW, hex, type Rgb } from './art-palette'
import { valueNoise } from './base-parts/noise'

/** The sea's depth bands, deepest first. A band is one flat colour, like the tints of a sea chart. */
export const OCEAN_BANDS: readonly Rgb[] = [OCEAN.abyss, OCEAN.deep, OCEAN.open, OCEAN.shelf, OCEAN.shallows]
/**
 * Wire depth where each band above the abyss begins. The simulation's open sea, away from any coast,
 * sits around wire 65; it is abyss here, the same colour as past the map, so the edge of the world never
 * meets the open sea in a straight line. The lighter bands are the shelf rising toward a coast.
 */
const BAND_FLOORS = [100, 128, 156, 180]
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
 * Where a coast comes near the world's edge, its shelf falls away to the abyss before the edge, so the
 * map never ends in the middle of a lighter band. A straight fall would cut such coasts in a straight
 * line, so the fall is ragged and its corners are rounded.
 *
 * Wire depth stays abyss for EDGE_HOLD tiles, then rises EDGE_DEPTH_STEP per tile; noise holds the
 * abyss up to EDGE_RAGGED tiles further in. Past EDGE_REACH the fall is above the shoreline, so it never
 * cuts the simulation's own depths in a straight line.
 */
const EDGE_DEPTH_STEP = 12
const EDGE_HOLD = 1
const EDGE_RAGGED = 12
const EDGE_CORNER = 14
const EDGE_REACH = EDGE_HOLD + EDGE_RAGGED + Math.ceil(200 / EDGE_DEPTH_STEP)
/** Size of the edge's ragged bays, in tiles. */
const EDGE_NOISE_SCALE = 22

/** Tiles from the world's edge, with the corners rounded off. */
function edgeDistance(row: number, col: number, width: number, height: number): number {
  const dx = Math.min(col, width - 1 - col)
  const dy = Math.min(row, height - 1 - row)
  if (dx < EDGE_CORNER && dy < EDGE_CORNER)
    return Math.max(0, EDGE_CORNER - Math.hypot(EDGE_CORNER - dx, EDGE_CORNER - dy))
  return Math.min(dx, dy)
}

/** The wire depth of the sea with the world's edge falling away to the abyss. */
export function seaDepthAt(
  wireDepth: number,
  row: number,
  col: number,
  width: number,
  height: number,
): number {
  const edge = edgeDistance(row, col, width, height)
  if (edge >= EDGE_REACH) return wireDepth
  const ragged = EDGE_RAGGED * valueNoise(col / EDGE_NOISE_SCALE, row / EDGE_NOISE_SCALE)
  const floor = Math.floor(Math.max(0, edge - EDGE_HOLD - ragged) * EDGE_DEPTH_STEP)
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
