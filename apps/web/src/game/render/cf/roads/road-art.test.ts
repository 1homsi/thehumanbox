import { describe, expect, it } from 'vitest'
import { TILE } from '../../../model/palette'
import {
  ROAD_E,
  ROAD_N,
  ROAD_S,
  ROAD_TRACK,
  ROAD_W,
  RAIL_COLOR,
  bridgeCellPixels,
  bridgeIsVertical,
  isRoadPixel,
  roadCellPixels,
  roadMask,
  roadStyle,
  roadStyleOfCode,
  roadStyleOfTier,
  roadCellKey,
  RAIL_STEEL,
  RAIL_TIE,
  railCellKey,
  railCellPixels,
  CANAL_BANK,
  CANAL_WATER,
  canalCellKey,
  canalCellPixels,
} from './road-art'

describe('dug irrigation channels', () => {
  const colourAt = (pixels: [number, number, string][], x: number, y: number) =>
    pixels.find(([px, py]) => px === x && py === y)?.[2]

  it('is water down the middle with a bank of earth beside it, and runs to the edge where it joins', () => {
    const north = canalCellPixels(ROAD_N)
    expect(colourAt(north, Math.floor(TILE / 2), Math.floor(TILE / 2))).toMatch(/^#(3f7fa8|7fb4d2)$/)
    expect(colourAt(north, Math.floor(TILE / 2), 0)).toMatch(/^#(3f7fa8|7fb4d2)$/)
    expect(colourAt(north, 1, Math.floor(TILE / 2))).toBe(CANAL_BANK)
    expect(colourAt(north, 0, Math.floor(TILE / 2))).toBeUndefined()
  })

  it('a channel with no joins is a square of water, and keys by its joins', () => {
    const alone = canalCellPixels(0)
    expect(alone.some(([, , c]) => c === CANAL_WATER || c === '#7fb4d2')).toBe(true)
    expect(colourAt(alone, 0, 0)).toBeUndefined()
    expect(canalCellKey(ROAD_N)).not.toBe(canalCellKey(0))
  })
})

describe('road joins', () => {
  // A plus of road around (1, 1) on a 3x3 grid.
  const roads = [
    [0, ROAD_TRACK, 0],
    [ROAD_TRACK, ROAD_TRACK, ROAD_TRACK],
    [0, ROAD_TRACK, 0],
  ]

  it('joins a cell to each neighbour that holds a road', () => {
    expect(roadMask(roads, 1, 1)).toBe(ROAD_N | ROAD_E | ROAD_S | ROAD_W)
    expect(roadMask(roads, 1, 0)).toBe(ROAD_E)
    expect(roadMask(roads, 0, 1)).toBe(ROAD_S)
  })

  it('treats the edge of the map as no road', () => {
    // The top row of the plus has no road above it: no north join there.
    expect(roadMask(roads, 0, 1) & ROAD_N).toBe(0)
    // A lone cell in the corner joins to nothing.
    expect(roadMask([[ROAD_TRACK]], 0, 0)).toBe(0)
  })
})

describe('road style by era', () => {
  it('is a dirt track in the stone ages and cobbles from the bronze age', () => {
    expect(roadStyle('pre_stone')).toBe('track')
    expect(roadStyle('stone')).toBe('track')
    expect(roadStyle('bronze')).toBe('track')
    expect(roadStyle('classical')).toBe('cobble')
    expect(roadStyle('medieval')).toBe('cobble')
    expect(roadStyle(undefined)).toBe('track')
    expect(roadStyle('genesis')).toBe('track')
  })
})

describe('bridges', () => {
  it('crosses the way the road goes: vertical when it joins from above or below only', () => {
    expect(bridgeIsVertical(ROAD_N | ROAD_S)).toBe(true)
    expect(bridgeIsVertical(ROAD_E | ROAD_W)).toBe(false)
    expect(bridgeIsVertical(ROAD_N | ROAD_E)).toBe(false)
    expect(bridgeIsVertical(0)).toBe(false)
  })

  it('paints rails along both sides and planks across the crossing', () => {
    const horizontal = bridgeCellPixels(false)
    expect(horizontal.length).toBe(TILE * TILE)
    // A horizontal bridge has its rails on the top and bottom rows.
    expect(horizontal.find(([x, y]) => x === 3 && y === 0)?.[2]).toBe(RAIL_COLOR)
    expect(horizontal.find(([x, y]) => x === 3 && y === 3)?.[2]).not.toBe(RAIL_COLOR)
    const vertical = bridgeCellPixels(true)
    expect(vertical.find(([x, y]) => x === 0 && y === 3)?.[2]).toBe(RAIL_COLOR)
  })
})

describe('railway track', () => {
  it('lays two steel rails along the way the track runs, with sleepers between them', () => {
    const across = (vertical: boolean) => {
      const steel = railCellPixels(vertical).filter(([, , c]) => c === RAIL_STEEL)
      return [...new Set(steel.map(([x, y]) => (vertical ? x : y)))].sort((a, b) => a - b)
    }
    const v = across(true)
    expect(v.length).toBe(2)
    expect(v[1]! - v[0]!).toBeGreaterThan(4)
    expect(across(false).length).toBe(2)
    // Sleepers lie across the track between the rails, not outside them.
    const ties = railCellPixels(true).filter(([, , c]) => c === RAIL_TIE)
    expect(ties.length).toBeGreaterThan(0)
    expect(ties.every(([x]) => x > v[0]! && x < v[1]!)).toBe(true)
  })

  it('keys a track cell by the way it runs', () => {
    expect(railCellKey(true)).not.toBe(railCellKey(false))
  })
})

describe('road cell art', () => {
  it('leaves an isolated cell as a centre patch', () => {
    const lone = roadCellPixels('track', 0)
    expect(lone.length).toBe(4 * 4)
    expect(isRoadPixel('track', 0, 0, 0)).toBe(false)
    expect(isRoadPixel('track', 0, 3, 3)).toBe(true)
  })

  it('runs an arm to the tile edge on each side the road continues', () => {
    // A road going north and south only: the top and bottom rows are road in the middle columns.
    expect(isRoadPixel('track', ROAD_N | ROAD_S, 3, 0)).toBe(true)
    expect(isRoadPixel('track', ROAD_N | ROAD_S, 3, TILE - 1)).toBe(true)
    expect(isRoadPixel('track', ROAD_N | ROAD_S, 0, 3)).toBe(false)
    expect(isRoadPixel('track', ROAD_N | ROAD_S, 3, 3)).toBe(true)
  })

  it('makes cobbles wider than the dirt track', () => {
    const dirt = roadCellPixels('track', ROAD_E | ROAD_W).length
    const cobble = roadCellPixels('cobble', ROAD_E | ROAD_W).length
    expect(cobble).toBeGreaterThan(dirt)
  })

  it('paints the same cell the same way every time', () => {
    expect(roadCellPixels('cobble', 5)).toEqual(roadCellPixels('cobble', 5))
  })
})

describe('paved roads', () => {
  const colourAt = (pixels: [number, number, string][], x: number, y: number) =>
    pixels.find(([px, py]) => px === x && py === y)?.[2]
  const brightness = (hex: string) => {
    const n = parseInt(hex.slice(1), 16)
    return (n >> 16) + ((n >> 8) & 255) + (n & 255)
  }
  const straight = roadCellPixels('paved', ROAD_E | ROAD_W)

  it('comes with industry: track, cobble, then paved by era tier and by planned code', () => {
    expect(roadStyleOfTier(1)).toBe('track')
    expect(roadStyleOfTier(2)).toBe('cobble')
    expect(roadStyleOfTier(4)).toBe('cobble')
    expect(roadStyleOfTier(5)).toBe('paved')
    expect(roadStyleOfTier(7)).toBe('paved')
    expect([1, 2, 3].map(roadStyleOfCode)).toEqual(['track', 'cobble', 'paved'])
  })

  it('is as wide as cobbles and runs to the tile edge where it joins', () => {
    expect(straight.length).toBe(roadCellPixels('cobble', ROAD_E | ROAD_W).length)
    expect(isRoadPixel('paved', ROAD_E | ROAD_W, 0, 3)).toBe(true)
    expect(isRoadPixel('paved', ROAD_E | ROAD_W, TILE - 1, 3)).toBe(true)
    expect(isRoadPixel('paved', ROAD_E | ROAD_W, 3, 0)).toBe(false)
  })

  it('is dark asphalt with a slightly lighter rim, lit on the sides facing the top-left light', () => {
    const middle = brightness(colourAt(straight, 4, 4)!)
    const top = colourAt(straight, 4, 1)!
    const bottom = colourAt(straight, 4, TILE - 2)!
    // Dark, like the pavement in the palette.
    expect(middle).toBeLessThan(260)
    expect(brightness(top)).toBeGreaterThan(middle)
    expect(brightness(bottom)).toBeGreaterThan(middle)
    // The edge facing the light is the lighter of the two.
    expect(brightness(top)).toBeGreaterThan(brightness(bottom))
  })

  it('carries one short dash on a straight run, and none at a junction, a bend or a dead end', () => {
    const dashes = (mask: number) => {
      const pixels = roadCellPixels('paved', mask)
      const base = new Set(pixels.map(([, , c]) => c))
      const line = pixels.filter(([, , c]) => c === '#cdb588')
      return { line, base }
    }
    const horizontal = dashes(ROAD_E | ROAD_W).line
    expect(horizontal.length).toBeGreaterThan(1)
    expect(horizontal.length).toBeLessThanOrEqual(4)
    expect(new Set(horizontal.map(([, y]) => y)).size).toBe(1)
    const vertical = dashes(ROAD_N | ROAD_S).line
    expect(new Set(vertical.map(([x]) => x)).size).toBe(1)
    expect(vertical.length).toBe(horizontal.length)
    for (const mask of [
      ROAD_N | ROAD_E,
      ROAD_N | ROAD_E | ROAD_S,
      ROAD_N | ROAD_E | ROAD_S | ROAD_W,
      ROAD_E,
      0,
    ]) {
      expect(dashes(mask).line).toHaveLength(0)
    }
  })

  it('lines up with the next tile of a straight run: the dash sits in the same place each tile', () => {
    expect(roadCellPixels('paved', ROAD_E | ROAD_W)).toEqual(roadCellPixels('paved', ROAD_E | ROAD_W))
    expect(roadCellKey('paved', ROAD_E | ROAD_W)).not.toBe(roadCellKey('cobble', ROAD_E | ROAD_W))
  })
})
