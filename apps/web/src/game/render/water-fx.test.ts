import { describe, expect, it } from 'vitest'
import { TILE_ID, isPermanentWaterTile } from '../model/terrain-ids'
import { permanentWaterDepth } from '../model/terrain-visuals'
import { TILE } from '../model/palette'
import {
  emitShimmerRects,
  emitStarRects,
  emitWaveletRects,
  firstIndexAtRow,
  waterCellIndex,
  type TileWindow,
} from './water-fx'
import { firstCellAtRow, specialTileIndex } from './special-tiles'

type Rect = [number, number, number, number]

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

function makeGrid(seed: number, width: number, height: number) {
  const rand = rng(seed)
  const tiles: number[][] = []
  const depth: number[][] = []
  const kinds = [
    TILE_ID.WATER,
    TILE_ID.WATER,
    TILE_ID.WATER,
    TILE_ID.GRASS,
    TILE_ID.FLOODED,
    TILE_ID.FOOD,
    TILE_ID.HUT,
    TILE_ID.FIRE,
    TILE_ID.CAMPFIRE,
    TILE_ID.MINERAL,
    TILE_ID.ROCK,
  ]
  for (let r = 0; r < height; r++) {
    const row: number[] = []
    const drow: number[] = []
    for (let c = 0; c < width; c++) {
      row.push(kinds[Math.floor(rand() * kinds.length)])
      // A mix of shallow, deep, out-of-range and missing depths.
      const roll = rand()
      drow.push(roll < 0.1 ? 300 : roll < 0.2 ? -5 : roll < 0.5 ? Math.floor(rand() * 254) : 200)
    }
    tiles.push(row)
    depth.push(drow)
  }
  return { tiles, depth }
}

// The per-tile scans this module replaced, kept verbatim as the reference.
function refShimmer(tiles: number[][], dm: number[][] | undefined, shimmerT: number, w: TileWindow) {
  const out: Rect[] = []
  for (let row = w.r0; row < w.r1; row++) {
    for (let col = w.c0; col < w.c1; col++) {
      const d = permanentWaterDepth(tiles[row]?.[col], dm?.[row]?.[col])
      if (d === null || d < 180) continue
      let h = (col * 374761393 + row * 668265263) | 0
      h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0
      const pulse = Math.sin(shimmerT * 2.1 + ((h & 0xff) / 255) * Math.PI * 2)
      if (pulse < 0.6) continue
      out.push([col * TILE + ((h >>> 8) & 3), row * TILE + ((h >>> 10) & 3), 2, 1])
    }
  }
  return out
}

function refWavelets(tiles: number[][], dm: number[][] | undefined, shimmerT: number, w: TileWindow) {
  const out: Rect[] = []
  const wavePhase = Math.floor(shimmerT * 3)
  for (let row = w.r0; row < w.r1; row += 2) {
    for (let col = w.c0; col < w.c1; col++) {
      const d = permanentWaterDepth(tiles[row]?.[col], dm?.[row]?.[col])
      if (d === null || d < 180) continue
      let h = (col * 374761393 + row * 668265263) | 0
      h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0
      if ((h + wavePhase) % 7 !== 0) continue
      out.push([col * TILE + 1 + ((h >>> 8) & 1), row * TILE + 2 + ((wavePhase + (h >>> 10)) & 3), 3, 1])
    }
  }
  return out
}

function refStars(tiles: number[][], tt: number, w: TileWindow) {
  const out: Rect[] = []
  for (let row = w.r0 & ~1; row < w.r1; row += 2) {
    for (let col = w.c0 & ~1; col < w.c1; col += 2) {
      if (!isPermanentWaterTile(tiles[row]?.[col])) continue
      let h = (col * 374761393 + row * 668265263) | 0
      h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0
      const phase = ((h & 0xff) / 255) * Math.PI * 2
      const blink = Math.sin(tt * 1.7 + phase) + Math.sin(tt * 0.9 + phase * 1.3)
      if (blink < 1.3) continue
      out.push([col * TILE + ((h >>> 8) & 3), row * TILE + ((h >>> 10) & 3), 2, 1])
    }
  }
  return out
}

function collect(run: (emit: (x: number, y: number, w: number, h: number) => void) => void): Rect[] {
  const out: Rect[] = []
  run((x, y, w, h) => out.push([x, y, w, h]))
  return out
}

const WINDOWS: TileWindow[] = [
  { r0: 0, r1: 40, c0: 0, c1: 60 },
  { r0: 7, r1: 31, c0: 13, c1: 44 },
  { r0: 8, r1: 9, c0: 20, c1: 21 },
  { r0: 3, r1: 40, c0: 1, c1: 2 },
  { r0: 39, r1: 40, c0: 59, c1: 60 },
  { r0: 12, r1: 12, c0: 0, c1: 60 },
]
// Times chosen to cover several wave phases (including ones that wrap mod 7) and a
// timestamp as large as Date.now().
const TIMES = [0, 1234, 55_555, 1_700_000_000_000, 1_700_000_000_123, 1_700_000_004_321]

describe('water effects match the per-tile scans they replaced', () => {
  const { tiles, depth } = makeGrid(7, 60, 40)
  const cells = waterCellIndex(tiles, depth)

  it('shimmer sparkles', () => {
    for (const win of WINDOWS) {
      for (const t of TIMES) {
        const shimmerT = t * 0.0015
        expect(collect((emit) => emitShimmerRects(cells, shimmerT, win, emit))).toEqual(
          refShimmer(tiles, depth, shimmerT, win),
        )
      }
    }
  })

  it('wavelet dashes', () => {
    for (const win of WINDOWS) {
      for (const t of TIMES) {
        const shimmerT = t * 0.0015
        expect(collect((emit) => emitWaveletRects(cells, shimmerT, win, emit))).toEqual(
          refWavelets(tiles, depth, shimmerT, win),
        )
      }
    }
  })

  it('star glints', () => {
    for (const win of WINDOWS) {
      for (const t of TIMES) {
        const tt = t * 0.001
        expect(collect((emit) => emitStarRects(cells, tt, win, emit))).toEqual(refStars(tiles, tt, win))
      }
    }
  })

  it('draws something in every pass, so the comparisons are not vacuous', () => {
    const win = WINDOWS[0]
    expect(refShimmer(tiles, depth, 55_555 * 0.0015, win).length).toBeGreaterThan(20)
    expect(refStars(tiles, 55_555 * 0.001, win).length).toBeGreaterThan(5)
    let waves = 0
    for (const t of TIMES) waves += refWavelets(tiles, depth, t * 0.0015, win).length
    expect(waves).toBeGreaterThan(20)
  })

  it('works without a depth map (every permanent water tile counts as deep)', () => {
    const noDepth = waterCellIndex(tiles, undefined)
    const win = WINDOWS[0]
    const shimmerT = 9999 * 0.0015
    expect(collect((emit) => emitShimmerRects(noDepth, shimmerT, win, emit))).toEqual(
      refShimmer(tiles, undefined, shimmerT, win),
    )
  })

  it('is rebuilt when the terrain grid or depth map is replaced, and reused otherwise', () => {
    const again = waterCellIndex(tiles, undefined)
    expect(waterCellIndex(tiles, undefined)).toBe(again)
    const other = makeGrid(99, 60, 40)
    const win = WINDOWS[1]
    const shimmerT = 4242 * 0.0015
    expect(
      collect((emit) => emitShimmerRects(waterCellIndex(other.tiles, other.depth), shimmerT, win, emit)),
    ).toEqual(refShimmer(other.tiles, other.depth, shimmerT, win))
  })

  it('finds the first listed row by binary search', () => {
    const rows = Int32Array.from([0, 0, 2, 2, 2, 5, 9])
    expect(firstIndexAtRow(rows, 0)).toBe(0)
    expect(firstIndexAtRow(rows, 1)).toBe(2)
    expect(firstIndexAtRow(rows, 2)).toBe(2)
    expect(firstIndexAtRow(rows, 3)).toBe(5)
    expect(firstIndexAtRow(rows, 10)).toBe(7)
  })
})

describe('special tile index', () => {
  const { tiles } = makeGrid(3, 50, 30)

  function scan(kinds: number[]): number[] {
    const out: number[] = []
    for (let row = 0; row < tiles.length; row++) {
      for (let col = 0; col < tiles[row].length; col++) {
        if (kinds.includes(tiles[row][col])) out.push(row, col)
      }
    }
    return out
  }

  it('lists the same cells, in the same row-major order, as a full tile scan', () => {
    const index = specialTileIndex(tiles)
    expect([...index.animated]).toEqual(scan([TILE_ID.FIRE, TILE_ID.CAMPFIRE, TILE_ID.HUT]))
    expect([...index.all]).toEqual(
      scan([TILE_ID.FIRE, TILE_ID.CAMPFIRE, TILE_ID.HUT, TILE_ID.FOOD, TILE_ID.MINERAL]),
    )
    expect(specialTileIndex(tiles)).toBe(index)
  })

  it('jumps to the first cell at or below a row', () => {
    const { animated } = specialTileIndex(tiles)
    for (const row of [0, 1, 7, 29, 30, 100]) {
      const at = firstCellAtRow(animated, row)
      expect(at % 2).toBe(0)
      if (at > 0) expect(animated[at - 2]).toBeLessThan(row)
      if (at < animated.length) expect(animated[at]).toBeGreaterThanOrEqual(row)
    }
  })
})
