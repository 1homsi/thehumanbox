/**
 * The cells a ground effect paints, found once per grid instead of on every pass. A frame that
 * carries a new tile layer brings new row arrays (`applyGridWire` never edits tiles in place), so
 * an index keyed by the tiles array is good until the next tile layer arrives. The ground effects
 * repaint about 15 times a second over the whole view; scanning every visible cell for the handful
 * of campfires, floods or vents was most of the main thread on a zoomed-out map.
 */

type Grid = readonly ArrayLike<number>[]

/** A window of sim tiles (inclusive-exclusive) and the sim coordinates of grid cell (0, 0). */
export interface CellView {
  c0: number
  c1: number
  r0: number
  r1: number
  ox: number
  oy: number
}

interface Entry {
  /** The second grid the cells were found with (biomes for vents), or null. */
  other: Grid | null
  cells: Int32Array
}

const indexes = new WeakMap<Grid, Map<string, Entry>>()

/**
 * Grid cells where `test(row, col)` holds, as flattened `row, col` pairs in row-major order.
 * Computed once per `grid` array and `key`; `other` names a second grid the test reads, and a new
 * one finds the cells again.
 */
export function cellsWhere(
  grid: Grid,
  key: string,
  test: (row: number, col: number) => boolean,
  other: Grid | null = null,
): Int32Array {
  let byKey = indexes.get(grid)
  if (!byKey) {
    byKey = new Map()
    indexes.set(grid, byKey)
  }
  const cached = byKey.get(key)
  if (cached && cached.other === other) return cached.cells
  const out: number[] = []
  for (let row = 0; row < grid.length; row++) {
    const r = grid[row]
    if (!r) continue
    for (let col = 0; col < r.length; col++) if (test(row, col)) out.push(row, col)
  }
  const cells = Int32Array.from(out)
  byKey.set(key, { other, cells })
  return cells
}

/** The first pair in `cells` (row-major `row, col` pairs) whose row is at least `row`, as a pair index. */
function firstPairAtRow(cells: Int32Array, row: number): number {
  let lo = 0
  let hi = cells.length >> 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (cells[mid * 2] < row) lo = mid + 1
    else hi = mid
  }
  return lo
}

/**
 * Calls `visit(row, col)` for each cell of `cells` (row-major `row, col` grid pairs) inside the view,
 * in row-major order, until it returns false.
 */
export function forCellsInView(
  cells: Int32Array,
  view: CellView,
  visit: (row: number, col: number) => boolean | void,
): void {
  const rowEnd = view.r1 - view.oy
  const colStart = view.c0 - view.ox
  const colEnd = view.c1 - view.ox
  for (let i = firstPairAtRow(cells, view.r0 - view.oy) * 2; i < cells.length; i += 2) {
    const row = cells[i]
    if (row >= rowEnd) return
    const col = cells[i + 1]
    if (col < colStart || col >= colEnd) continue
    if (visit(row, col) === false) return
  }
}
