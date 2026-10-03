/** First `row, col` pair (as an index into the flattened list) whose row is at least `row`. */
export function firstPairAtRow(cells: Int32Array, row: number): number {
  let lo = 0
  let hi = cells.length >> 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (cells[mid * 2] < row) lo = mid + 1
    else hi = mid
  }
  return lo * 2
}
