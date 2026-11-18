import { describe, expect, it } from 'vitest'
import { TILE } from '../../../model/palette'
import {
  CORNER_NE,
  CORNER_SW,
  RAIL_STEEL,
  ROAD_E,
  ROAD_N,
  ROAD_NE,
  ROAD_RAIL,
  ROAD_S,
  ROAD_SE,
  ROAD_SW,
  ROAD_NW,
  ROAD_TRACK,
  ROAD_W,
  bridgeIsVertical,
  isRailBend,
  isStraightRail,
  railCellPixels,
  railCornerPixels,
  railJoinPixels,
  roadCellPixels,
  roadCornerPixels,
} from './road-art'
import { CODE_CORNERS, cellJoins, diagonalLink, tileBlock, type RoadCells } from './road-tiling'

const RAIL_SPEC = (ROAD_RAIL << 4) | 1
const TRACK_SPEC = (ROAD_TRACK << 4) | 1

function cells(map: string[]): RoadCells {
  const at = (r: number, c: number) => map[r]?.[c] ?? '.'
  return {
    width: map[0]!.length,
    height: map.length,
    spec: (r, c) => (at(r, c) === 'R' ? RAIL_SPEC : at(r, c) === 'T' ? TRACK_SPEC : -1),
    joins: (_spec, r, c) => at(r, c) === 'R' || at(r, c) === 'T',
    station: (r, c) => at(r, c) === 'S',
  }
}

function steelOf(pixels: [number, number, string][]): Set<string> {
  return new Set(pixels.filter(([, , c]) => c === RAIL_STEEL).map(([x, y]) => `${x},${y}`))
}

function render(map: string[]): Set<string> {
  const g = cells(map)
  const out: number[] = []
  tileBlock(g, 0, g.height, 0, g.width, out)
  const steel = new Set<string>()
  for (let i = 0; i < out.length; i += 2) {
    const r = Math.floor(out[i]! / g.width)
    const c = out[i]! % g.width
    const code = out[i + 1]!
    const mask = code & 0xff
    const pixels =
      code & CODE_CORNERS
        ? railCornerPixels(mask)
        : isStraightRail(mask)
          ? railCellPixels(bridgeIsVertical(mask & 0xf))
          : railJoinPixels(mask)
    for (const [x, y, colour] of pixels)
      if (colour === RAIL_STEEL) steel.add(`${c * TILE + x},${r * TILE + y}`)
  }
  return steel
}

function pieces(steel: Set<string>): number {
  const seen = new Set<string>()
  let n = 0
  for (const start of steel) {
    if (seen.has(start)) continue
    n++
    const stack = [start]
    seen.add(start)
    while (stack.length) {
      const [x, y] = stack.pop()!.split(',').map(Number) as [number, number]
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const k = `${x + dx},${y + dy}`
          if (steel.has(k) && !seen.has(k)) {
            seen.add(k)
            stack.push(k)
          }
        }
    }
  }
  return n
}

describe('diagonal joins', () => {
  it('joins two cells that touch only at a corner, and not when a cell beside the corner carries the road', () => {
    const g = cells(['R.', '.R'])
    expect(diagonalLink(g, 0, 0, 1, 1)).toBe(true)
    expect(diagonalLink(g, 1, 1, -1, -1)).toBe(true)
    expect(diagonalLink(cells(['RR', '.R']), 0, 0, 1, 1)).toBe(false)
  })

  it('does not join a railway to a road across a corner', () => {
    expect(diagonalLink(cells(['R.', '.T']), 0, 0, 1, 1)).toBe(false)
  })

  it('gives the middle of a staircase a join to each diagonal neighbour', () => {
    const g = cells(['R..', '.R.', '..R'])
    expect(cellJoins(g, 1, 1, RAIL_SPEC)).toBe(ROAD_SE | ROAD_NW)
    expect(cellJoins(cells(['..R', '.R.', 'R..']), 1, 1, RAIL_SPEC)).toBe(ROAD_NE | ROAD_SW)
  })

  it('cuts across the corners of the cells beside each diagonal join', () => {
    const out: number[] = []
    const g = cells(['R.', '.R'])
    tileBlock(g, 0, 2, 0, 2, out)
    const corners = new Map<number, number>()
    for (let i = 0; i < out.length; i += 2)
      if (out[i + 1]! & CODE_CORNERS) corners.set(out[i]!, out[i + 1]! & 0xf)
    expect(corners.get(1)).toBe(CORNER_SW)
    expect(corners.get(2)).toBe(CORNER_NE)
  })

  it('tiles a block the same as the whole map, links across its edge included', () => {
    const map = ['R.......', '.R......', '..R.....', '...RRR..', '......R.', '.......R']
    const g = cells(map)
    const whole: number[] = []
    tileBlock(g, 0, g.height, 0, g.width, whole)
    const parts: number[] = []
    for (const [r0, c0] of [
      [0, 0],
      [0, 4],
      [3, 0],
      [3, 4],
    ] as const)
      tileBlock(g, r0, r0 + 3, c0, c0 + 4, parts)
    const pairs = (a: number[]) => {
      const out: string[] = []
      for (let i = 0; i < a.length; i += 2) out.push(`${a[i]}:${a[i + 1]}`)
      return out.sort()
    }
    expect(pairs(parts)).toEqual(pairs(whole))
  })
})

describe('a railway drawn across its joins', () => {
  it('runs each rail of a diagonal line as one unbroken line', () => {
    expect(pieces(render(['R....', '.R...', '..R..', '...R.', '....R']))).toBe(2)
    expect(pieces(render(['....R', '...R.', '..R..', '.R...', 'R....']))).toBe(2)
  })

  it('keeps both rails whole through a staircase of straight and diagonal steps', () => {
    expect(pieces(render(['RR.....', '..R....', '...RR..', '.....R.', '......R']))).toBe(2)
  })

  it('keeps both rails whole round a bend of right-angled steps', () => {
    expect(pieces(render(['RR...', '.R...', '.RR..', '..R..', '..RRR']))).toBe(2)
  })

  it('takes a right-angled bend as a quarter circle that meets the straight rails at the edges', () => {
    expect(isRailBend(ROAD_N | ROAD_E)).toBe(true)
    expect(isRailBend(ROAD_N | ROAD_S)).toBe(false)
    expect(isRailBend(ROAD_N | ROAD_E | ROAD_SW)).toBe(false)
    const bend = steelOf(railJoinPixels(ROAD_W | ROAD_S))
    const across = steelOf(railCellPixels(false))
    const down = steelOf(railCellPixels(true))
    for (let y = 0; y < TILE; y++) expect(bend.has(`0,${y}`)).toBe(across.has(`0,${y}`))
    for (let x = 0; x < TILE; x++) expect(bend.has(`${x},${TILE - 1}`)).toBe(down.has(`${x},${TILE - 1}`))
  })

  it('keeps the old straight pieces where a railway does not bend or run on diagonally', () => {
    expect(isStraightRail(ROAD_N | ROAD_S)).toBe(true)
    expect(isStraightRail(ROAD_E)).toBe(true)
    expect(isStraightRail(ROAD_N | ROAD_E | ROAD_W)).toBe(true)
    expect(isStraightRail(ROAD_E | ROAD_SW)).toBe(false)
  })
})

describe('a road drawn across its diagonal joins', () => {
  it('runs a band to each joined corner and has no centre patch when it only runs diagonally', () => {
    const diagonal = new Set(roadCellPixels('track', ROAD_NE | ROAD_SW).map(([x, y]) => `${x},${y}`))
    expect(diagonal.has(`${TILE - 1},0`)).toBe(true)
    expect(diagonal.has(`0,${TILE - 1}`)).toBe(true)
    expect(diagonal.has('2,2')).toBe(false)
    expect(diagonal.has(`${TILE - 3},${TILE - 3}`)).toBe(false)
  })

  it('keeps the centre patch where a straight join meets a diagonal one', () => {
    const bend = new Set(roadCellPixels('cobble', ROAD_W | ROAD_SE).map(([x, y]) => `${x},${y}`))
    expect(bend.has('0,3')).toBe(true)
    expect(bend.has(`${TILE - 1},${TILE - 1}`)).toBe(true)
  })

  it('fills the corner a diagonal road cuts across, and nothing else of that cell', () => {
    const corner = roadCornerPixels('paved', CORNER_NE)
    expect(corner.length).toBeGreaterThan(0)
    expect(corner.every(([x, y]) => x >= TILE / 2 && y < TILE / 2)).toBe(true)
  })
})

describe('a railway into its station', () => {
  it('runs the last cell of a line into the station beside it', () => {
    const g = cells(['SSS..', 'SSS..', '...R.', '....R'])
    expect(cellJoins(g, 2, 3, RAIL_SPEC) & 0xf0).toBe(ROAD_NW | ROAD_SE)
  })

  it('reaches straight for a station beside the end of the line', () => {
    const g = cells(['SSS.', 'SSSR', '...R'])
    expect(cellJoins(g, 1, 3, RAIL_SPEC)).toBe(ROAD_W | ROAD_S)
  })

  it('leaves a line that runs past a station alone', () => {
    const g = cells(['SSS..', 'RRRRR'])
    expect(cellJoins(g, 1, 1, RAIL_SPEC)).toBe(ROAD_E | ROAD_W)
  })

  it('does not join a road to a station', () => {
    const g = cells(['SSS.', '...T'])
    expect(cellJoins(g, 1, 3, TRACK_SPEC)).toBe(0)
  })

  it('draws the corners a diagonal join into the station cuts across', () => {
    const out: number[] = []
    tileBlock(cells(['S.', '.R']), 0, 2, 0, 2, out)
    const corners = out.filter((_, i) => i % 2 === 1 && out[i]! & CODE_CORNERS).length
    expect(corners).toBe(2)
  })
})
