import { describe, expect, it } from 'vitest'
import { TILE_RGB } from '../../model/palette'
import { TILE_ID } from '../../model/terrain-ids'
import { paintMinimapPixels, type MinimapSource } from './minimap-paint'

const colors = (id: string): readonly [number, number, number] =>
  id === 'red' ? [200, 30, 30] : [30, 30, 200]

/** A 3 x 2 grid painted at its own size, so one cell is one pixel. */
function source(over: Partial<MinimapSource> = {}): MinimapSource {
  return {
    width: 3,
    height: 2,
    ox: 10,
    oy: 20,
    tiles: [
      [TILE_ID.GRASS, TILE_ID.WATER, TILE_ID.SNOW],
      [TILE_ID.ROCK, TILE_ID.SAND, TILE_ID.GRASS],
    ],
    organisms: [],
    buildings: [],
    ...over,
  }
}

const rgbOf = (tile: number) => [...(TILE_RGB[tile] as readonly number[])]

const pixel = (out: Uint8ClampedArray, width: number, col: number, row: number) => {
  const i = (row * width + col) * 4
  return [out[i], out[i + 1], out[i + 2], out[i + 3]]
}

describe('paintMinimapPixels', () => {
  it('paints one opaque pixel per cell in the terrain colour', () => {
    const out = new Uint8ClampedArray(3 * 2 * 4)
    paintMinimapPixels(out, source(), 3, 2, colors)
    expect(pixel(out, 3, 0, 0).slice(0, 3)).toEqual(rgbOf(TILE_ID.GRASS))
    expect(pixel(out, 3, 1, 0).slice(0, 3)).toEqual(rgbOf(TILE_ID.WATER))
    expect(pixel(out, 3, 2, 1).slice(0, 3)).toEqual(rgbOf(TILE_ID.GRASS))
    expect(pixel(out, 3, 2, 1)[3]).toBe(255)
  })

  it('resamples the grid to a larger size, so each cell covers a block of pixels', () => {
    const out = new Uint8ClampedArray(6 * 4 * 4)
    paintMinimapPixels(out, source(), 6, 4, colors)
    // Cell (1, 0) (water) covers columns 2 and 3 of the first two rows.
    expect(pixel(out, 6, 2, 0).slice(0, 3)).toEqual(rgbOf(TILE_ID.WATER))
    expect(pixel(out, 6, 3, 1).slice(0, 3)).toEqual(rgbOf(TILE_ID.WATER))
    expect(pixel(out, 6, 4, 0).slice(0, 3)).toEqual(rgbOf(TILE_ID.SNOW))
  })

  it('shows unknown tiles as the void colour rather than leaving them blank', () => {
    const out = new Uint8ClampedArray(4)
    paintMinimapPixels(out, source({ width: 1, height: 1, tiles: [[999]] }), 1, 1, colors)
    expect([out[0], out[1], out[2], out[3]]).toEqual([14, 11, 8, 255])
  })

  it('paints buildings and living people in their tribe colour; the dead are not shown', () => {
    const out = new Uint8ClampedArray(3 * 2 * 4)
    paintMinimapPixels(
      out,
      source({
        buildings: [{ x: 11, y: 20, owner_lineage: 'red' }],
        organisms: [
          { x: 12.4, y: 21.9, lineage_id: 'blue', alive: true },
          { x: 10, y: 21, lineage_id: 'red', alive: false },
        ],
      }),
      3,
      2,
      colors,
    )
    expect(pixel(out, 3, 1, 0).slice(0, 3)).toEqual([200, 30, 30])
    expect(pixel(out, 3, 2, 1).slice(0, 3)).toEqual([30, 30, 200])
    expect(pixel(out, 3, 0, 1).slice(0, 3)).toEqual(rgbOf(TILE_ID.ROCK))
    // The dead red person in cell (0, 1) left no mark.
    expect(pixel(out, 3, 0, 1).slice(0, 3)).not.toEqual([200, 30, 30])
  })

  it('ignores things outside the grid and buildings without an owner', () => {
    const out = new Uint8ClampedArray(3 * 2 * 4)
    paintMinimapPixels(
      out,
      source({
        buildings: [
          { x: 99, y: 99, owner_lineage: 'red' },
          { x: 10, y: 20 },
        ],
        organisms: [{ x: 9, y: 20, lineage_id: 'red', alive: true }],
      }),
      3,
      2,
      colors,
    )
    expect(pixel(out, 3, 0, 0).slice(0, 3)).toEqual(rgbOf(TILE_ID.GRASS))
  })

  it('refuses a buffer that is too small for its size', () => {
    expect(() => paintMinimapPixels(new Uint8ClampedArray(4), source(), 3, 2, colors)).toThrow()
  })
})
