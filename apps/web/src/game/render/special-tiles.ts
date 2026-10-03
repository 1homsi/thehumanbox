import { TILE_ID } from '../model/terrain-ids'

// The per-frame terrain pass only has work for a handful of tile kinds (huts, fires,
// campfires and, when food/minerals are not baked, those too). Rather than testing
// all 180k tiles every frame, the cells of those kinds are listed once per terrain
// grid, in row-major order so drawing order is unchanged.
export interface SpecialTileIndex {
  /** Fire, campfire and hut cells as flattened `row, col` pairs. */
  animated: Int32Array
  /** The animated kinds plus food and mineral cells, same layout. */
  all: Int32Array
}
const EMPTY_SPECIAL: SpecialTileIndex = { animated: new Int32Array(0), all: new Int32Array(0) }
let specialSource: number[][] | null = null
let special: SpecialTileIndex = EMPTY_SPECIAL
export function specialTileIndex(tiles: number[][]): SpecialTileIndex {
  if (tiles === specialSource) return special
  const animated: number[] = []
  const all: number[] = []
  for (let row = 0; row < tiles.length; row++) {
    const tr = tiles[row]
    if (!tr) continue
    for (let col = 0; col < tr.length; col++) {
      const tile = tr[col]
      if (tile === TILE_ID.FIRE || tile === TILE_ID.CAMPFIRE || tile === TILE_ID.HUT) {
        animated.push(row, col)
        all.push(row, col)
      } else if (tile === TILE_ID.FOOD || tile === TILE_ID.MINERAL) {
        all.push(row, col)
      }
    }
  }
  specialSource = tiles
  special = { animated: Int32Array.from(animated), all: Int32Array.from(all) }
  return special
}

/** First pair in a row-major `row, col` list whose row is at least `row`. */
export function firstCellAtRow(cells: Int32Array, row: number): number {
  let lo = 0
  let hi = cells.length >> 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (cells[mid * 2] < row) lo = mid + 1
    else hi = mid
  }
  return lo * 2
}
