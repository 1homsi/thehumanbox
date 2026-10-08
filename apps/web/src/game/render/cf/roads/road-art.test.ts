import { describe, expect, it } from 'vitest'
import { TILE } from '../../../model/palette'
import {
  ROAD_E,
  ROAD_N,
  ROAD_S,
  ROAD_TRACK,
  ROAD_W,
  isRoadPixel,
  roadCellPixels,
  roadMask,
  roadStyle,
} from './road-art'

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
