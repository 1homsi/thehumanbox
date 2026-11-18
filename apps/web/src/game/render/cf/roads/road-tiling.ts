import {
  ROAD_E,
  ROAD_N,
  ROAD_NE,
  ROAD_NW,
  ROAD_RAIL,
  ROAD_S,
  ROAD_SE,
  ROAD_SW,
  ROAD_TRACK,
  ROAD_W,
} from './road-art'

export const CODE_KIND_SHIFT = 8
export const CODE_STYLE_SHIFT = 12
export const CODE_CORNERS = 1 << 14

export interface RoadCells {
  width: number
  height: number
  spec(r: number, c: number): number
  joins(spec: number, r: number, c: number): boolean
  station(r: number, c: number): boolean
}

const ORTHS: readonly (readonly [number, number, number])[] = [
  [-1, 0, ROAD_N],
  [0, 1, ROAD_E],
  [1, 0, ROAD_S],
  [0, -1, ROAD_W],
]

const DIAGS: readonly (readonly [number, number, number])[] = [
  [-1, 1, ROAD_NE],
  [1, 1, ROAD_SE],
  [1, -1, ROAD_SW],
  [-1, -1, ROAD_NW],
]

const kindOf = (spec: number) => (spec >> 4) & 0xf
const runsDiagonally = (kind: number) => kind === ROAD_TRACK || kind === ROAD_RAIL

function cornerBit(dr: number, dc: number): number {
  if (dr < 0) return dc > 0 ? 1 : 8
  return dc > 0 ? 2 : 4
}

export function diagonalLink(g: RoadCells, r: number, c: number, dr: number, dc: number): boolean {
  const p = g.spec(r, c)
  if (p < 0 || !runsDiagonally(kindOf(p))) return false
  const q = g.spec(r + dr, c + dc)
  if (q < 0 || kindOf(q) !== kindOf(p)) return false
  if (!g.joins(p, r + dr, c + dc) || !g.joins(q, r, c)) return false
  return !g.joins(p, r + dr, c) && !g.joins(p, r, c + dc) && !g.joins(q, r + dr, c) && !g.joins(q, r, c + dc)
}

function countBits(mask: number): number {
  let n = 0
  for (let m = mask; m; m &= m - 1) n++
  return n
}

function stationJoin(g: RoadCells, r: number, c: number, spec: number, mask: number): number {
  if (kindOf(spec) !== ROAD_RAIL || countBits(mask) > 1) return 0
  for (const [dr, dc, bit] of ORTHS) if (!(mask & bit) && g.station(r + dr, c + dc)) return bit
  for (const [dr, dc, bit] of DIAGS) {
    if (!g.station(r + dr, c + dc) || g.station(r + dr, c) || g.station(r, c + dc)) continue
    if (!g.joins(spec, r + dr, c) && !g.joins(spec, r, c + dc)) return bit
  }
  return 0
}

export function cellJoins(g: RoadCells, r: number, c: number, spec: number): number {
  let mask = 0
  for (const [dr, dc, bit] of ORTHS) if (g.joins(spec, r + dr, c + dc)) mask |= bit
  for (const [dr, dc, bit] of DIAGS) if (diagonalLink(g, r, c, dr, dc)) mask |= bit
  return mask | stationJoin(g, r, c, spec, mask)
}

export function tileBlock(g: RoadCells, r0: number, r1: number, c0: number, c1: number, out: number[]): void {
  const corners = new Map<number, number>()
  const mark = (r: number, c: number, bit: number, group: number) => {
    if (r < r0 || r >= r1 || c < c0 || c >= c1) return
    const key = (r * g.width + c) * 8 + group
    corners.set(key, (corners.get(key) ?? 0) | bit)
  }
  for (let r = Math.max(0, r0 - 1); r < Math.min(g.height, r1 + 1); r++) {
    for (let c = Math.max(0, c0 - 1); c < Math.min(g.width, c1 + 1); c++) {
      const spec = g.spec(r, c)
      if (spec < 0) continue
      const kind = kindOf(spec)
      const inside = r >= r0 && r < r1 && c >= c0 && c < c1
      if (!inside && !runsDiagonally(kind)) continue
      const mask = cellJoins(g, r, c, spec)
      if (inside)
        out.push(r * g.width + c, ((spec >> 8) << CODE_STYLE_SHIFT) | (kind << CODE_KIND_SHIFT) | mask)
      if (mask < 16) continue
      const group = kind === ROAD_RAIL ? 7 : spec >> 8
      for (const [dr, dc, bit] of DIAGS) {
        if (!(mask & bit)) continue
        const toStation = g.spec(r + dr, c + dc) < 0
        if (dc < 0 && !toStation) continue
        mark(r + dr, c, cornerBit(-dr, dc), group)
        mark(r, c + dc, cornerBit(dr, -dc), group)
      }
    }
  }
  for (const [key, bits] of corners) {
    const group = key % 8
    const code =
      group === 7
        ? (ROAD_RAIL << CODE_KIND_SHIFT) | bits
        : (group << CODE_STYLE_SHIFT) | (ROAD_TRACK << CODE_KIND_SHIFT) | bits
    out.push((key - group) / 8, CODE_CORNERS | code)
  }
}
