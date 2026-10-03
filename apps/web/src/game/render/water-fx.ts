import { isPermanentWaterTile } from '../model/terrain-ids'
import { permanentWaterDepth } from '../model/terrain-visuals'
import { TILE } from '../model/palette'

// Shimmer, wavelets and stars each scanned every visible water tile per frame,
// recomputing the same position hash for it. The hash (and which tiles take part)
// only depends on the terrain grid, so the cells are listed once per terrain grid,
// in row-major order so rects are emitted in the same order as the old tile scan.
export interface CellList {
  rows: Int32Array
  cols: Int32Array
  /** The tile's position hash; its low byte, bits 8-9 and bits 10-11 drive the animation. */
  hashes: Uint32Array
}
export interface WaterCells {
  /** Deep permanent water (depth 180+): the sparkle pass. */
  shimmer: CellList
  /** The same cells split by `hash % 7`, so a frame only walks the one bucket that animates. */
  wavelets: CellList[]
  /** Permanent water on even rows and columns: the star-glint pass. */
  stars: CellList
}

export interface TileWindow {
  r0: number
  r1: number
  c0: number
  c1: number
}

export type RectEmitter = (x: number, y: number, w: number, h: number) => void

interface CellListBuilder {
  rows: number[]
  cols: number[]
  hashes: number[]
}
const newBuilder = (): CellListBuilder => ({ rows: [], cols: [], hashes: [] })
const finishList = (b: CellListBuilder): CellList => ({
  rows: Int32Array.from(b.rows),
  cols: Int32Array.from(b.cols),
  hashes: Uint32Array.from(b.hashes),
})

export function tileHash(col: number, row: number): number {
  let h = (col * 374761393 + row * 668265263) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0
  return h
}

let waterSource: number[][] | null = null
let waterDepth: number[][] | undefined
let water: WaterCells | null = null

/** Water cells for a terrain grid, rebuilt only when the grid or its depth map is replaced. */
export function waterCellIndex(tiles: number[][], depthMap: number[][] | undefined): WaterCells {
  if (water && tiles === waterSource && depthMap === waterDepth) return water
  const shimmer = newBuilder()
  const stars = newBuilder()
  const wavelets = Array.from({ length: 7 }, newBuilder)
  for (let row = 0; row < tiles.length; row++) {
    const tr = tiles[row]
    if (!tr) continue
    const dr = depthMap?.[row]
    for (let col = 0; col < tr.length; col++) {
      if (!isPermanentWaterTile(tr[col])) continue
      const h = tileHash(col, row)
      if ((row & 1) === 0 && (col & 1) === 0) {
        stars.rows.push(row)
        stars.cols.push(col)
        stars.hashes.push(h)
      }
      const d = permanentWaterDepth(tr[col], dr?.[col])
      if (d === null || d < 180) continue
      shimmer.rows.push(row)
      shimmer.cols.push(col)
      shimmer.hashes.push(h)
      const bucket = wavelets[h % 7]
      bucket.rows.push(row)
      bucket.cols.push(col)
      bucket.hashes.push(h)
    }
  }
  waterSource = tiles
  waterDepth = depthMap
  water = { shimmer: finishList(shimmer), wavelets: wavelets.map(finishList), stars: finishList(stars) }
  return water
}

/** First index in a row-sorted list whose row is at least `row`. */
export function firstIndexAtRow(rows: Int32Array, row: number): number {
  let lo = 0
  let hi = rows.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (rows[mid] < row) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** Pulsing sparkles on deep water. `shimmerT` is `t * 0.0015`. */
export function emitShimmerRects(cells: WaterCells, shimmerT: number, win: TileWindow, emit: RectEmitter) {
  // Only 256 distinct phases exist (the hash's low byte), so each frame
  // evaluates the sine once per phase instead of once per tile.
  const pulseByPhase = new Float64Array(256)
  for (let k = 0; k < 256; k++) pulseByPhase[k] = Math.sin(shimmerT * 2.1 + (k / 255) * Math.PI * 2)
  const { rows, cols, hashes } = cells.shimmer
  for (let i = firstIndexAtRow(rows, win.r0); i < rows.length; i++) {
    const row = rows[i]
    if (row >= win.r1) break
    const col = cols[i]
    if (col < win.c0 || col >= win.c1) continue
    const h = hashes[i]
    if (pulseByPhase[h & 0xff] < 0.6) continue
    emit(col * TILE + ((h >>> 8) & 3), row * TILE + ((h >>> 10) & 3), 2, 1)
  }
}

/** Short wave dashes on every other row of the window. `shimmerT` is `t * 0.0015`. */
export function emitWaveletRects(cells: WaterCells, shimmerT: number, win: TileWindow, emit: RectEmitter) {
  const wavePhase = Math.floor(shimmerT * 3)
  // (h + wavePhase) % 7 === 0 only for the tiles whose hash falls in one residue class.
  const residue = (7 - (((wavePhase % 7) + 7) % 7)) % 7
  const { rows, cols, hashes } = cells.wavelets[residue]
  for (let i = firstIndexAtRow(rows, win.r0); i < rows.length; i++) {
    const row = rows[i]
    if (row >= win.r1) break
    if (((row - win.r0) & 1) !== 0) continue
    const col = cols[i]
    if (col < win.c0 || col >= win.c1) continue
    const h = hashes[i]
    emit(col * TILE + 1 + ((h >>> 8) & 1), row * TILE + 2 + ((wavePhase + (h >>> 10)) & 3), 3, 1)
  }
}

/** Blinking star glints on even-aligned water cells. `tt` is `t * 0.001`. */
export function emitStarRects(cells: WaterCells, tt: number, win: TileWindow, emit: RectEmitter) {
  // The blink depends only on the hash's low byte, so it is evaluated
  // once per phase per frame instead of twice per water tile.
  const blinkByPhase = new Float64Array(256)
  for (let k = 0; k < 256; k++) {
    const phase = (k / 255) * Math.PI * 2
    blinkByPhase[k] = Math.sin(tt * 1.7 + phase) + Math.sin(tt * 0.9 + phase * 1.3)
  }
  const { rows, cols, hashes } = cells.stars
  const rowStart = win.r0 & ~1
  const colStart = win.c0 & ~1
  for (let i = firstIndexAtRow(rows, rowStart); i < rows.length; i++) {
    const row = rows[i]
    if (row >= win.r1) break
    const col = cols[i]
    if (col < colStart || col >= win.c1) continue
    const h = hashes[i]
    if (blinkByPhase[h & 0xff] < 1.3) continue
    emit(col * TILE + ((h >>> 8) & 3), row * TILE + ((h >>> 10) & 3), 2, 1)
  }
}
