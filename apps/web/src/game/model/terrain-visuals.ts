import { TILE_ID, isPermanentWaterTile } from './terrain-ids'

export const EDGE_NORTH = 1
export const EDGE_SOUTH = 2
export const EDGE_WEST = 4
export const EDGE_EAST = 8

/**
 * Occupancy tiles replace the ground in the wire grid. The 2D base layer
 * restores their original grass-like substrate and draws the object later.
 */
export function baseTerrainTile(tile: number | undefined): number {
  switch (tile) {
    case TILE_ID.FOOD:
    case TILE_ID.FIRE:
    case TILE_ID.CAMPFIRE:
    case TILE_ID.HUT:
    case TILE_ID.MINERAL:
      return TILE_ID.GRASS
    default:
      return tile ?? TILE_ID.VOID
  }
}

export function terrainVisualSignature(tiles: number[][], width: number, height: number): number {
  let hash = 2166136261
  for (let row = 0; row < height; row++) {
    const values = tiles[row]
    for (let col = 0; col < width; col++) {
      const tile = values?.[col]
      // Food growth is frequent and uses the same tree/decor substrate as
      // grass. Structures, fire and minerals still invalidate decorations.
      const cacheTile = tile === TILE_ID.FOOD ? TILE_ID.GRASS : (tile ?? TILE_ID.VOID)
      hash ^= cacheTile + ((row * width + col) & 0xff)
      hash = Math.imul(hash, 16777619)
    }
  }
  return hash >>> 0
}

/** Permanent water directly beside a land tile; floods never create beaches. */
export function permanentWaterNeighborMask(tiles: number[][], row: number, col: number): number {
  let mask = 0
  if (row > 0 && tiles[row - 1]?.[col] === TILE_ID.WATER) mask |= EDGE_NORTH
  if (row + 1 < tiles.length && tiles[row + 1]?.[col] === TILE_ID.WATER) mask |= EDGE_SOUTH
  const here = tiles[row]
  if (col > 0 && here?.[col - 1] === TILE_ID.WATER) mask |= EDGE_WEST
  if (col + 1 < (here?.length ?? 0) && here?.[col + 1] === TILE_ID.WATER) mask |= EDGE_EAST
  return mask
}

/**
 * Land-facing edges of a permanent water tile. Floodwater counts as water so
 * lakes do not draw a false foam seam where a flood meets the shore.
 */
export function permanentWaterLandEdgeMask(tiles: number[][], row: number, col: number): number {
  const here = tiles[row]
  if (here?.[col] !== TILE_ID.WATER) return 0
  let mask = 0
  if (row > 0 && isLandTile(tiles[row - 1]?.[col])) mask |= EDGE_NORTH
  if (row + 1 < tiles.length && isLandTile(tiles[row + 1]?.[col])) mask |= EDGE_SOUTH
  if (col > 0 && isLandTile(here[col - 1])) mask |= EDGE_WEST
  if (col + 1 < here.length && isLandTile(here[col + 1])) mask |= EDGE_EAST
  return mask
}

function isLandTile(tile: number | undefined): boolean {
  return tile !== undefined && tile !== TILE_ID.WATER && tile !== TILE_ID.FLOODED
}

/** Depth controls water shading only. Live tile state remains authoritative. */
export function permanentWaterDepth(tile: number | undefined, depth: number | undefined): number | null {
  if (!isPermanentWaterTile(tile)) return null
  if (Number.isFinite(depth) && depth !== undefined && depth >= 0 && depth < 254) return depth
  return 220
}
