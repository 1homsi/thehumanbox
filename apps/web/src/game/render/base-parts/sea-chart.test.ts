import { describe, expect, it } from 'vitest'
import { TILE } from '../../model/palette'
import { OCEAN } from '../art-palette'
import { OCEAN_BANDS } from '../landscape-style'
import { chartCellKey, forEachChartCell, paintChartCell } from './sea-chart'

/** Paints a cell into a grid of CSS colours ('' where nothing was drawn). */
function paint(key: number): string[][] {
  const px = Array.from({ length: TILE }, () => Array<string>(TILE).fill(''))
  const ctx = {
    fillStyle: '',
    fillRect(x: number, y: number, w: number, h: number) {
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) px[yy][xx] = this.fillStyle
    },
  }
  paintChartCell(ctx as unknown as CanvasRenderingContext2D, key, 0, 0)
  return px
}

const css = (rgb: readonly number[]) => `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`

describe('sea chart cells', () => {
  it('has nothing to draw where all the sea around a corner is one band', () => {
    const bands = Int8Array.from([2, 2, 2, 2])
    expect(chartCellKey(bands, 2, 0, 0)).toBeNull()
    // Land around the corner does not need a cell either: the ground already shows the band.
    expect(chartCellKey(Int8Array.from([2, -1, 2, -1]), 2, 0, 0)).toBeNull()
    expect(chartCellKey(Int8Array.from([-1, -1, -1, -1]), 2, 0, 0)).toBeNull()
  })

  it('shows each tile centre in its own band and a one-pixel light contour on the deeper side', () => {
    // The north half deep (1), the south half on the shelf (3): the boundary runs east-west.
    const key = chartCellKey(Int8Array.from([1, 1, 3, 3]), 2, 0, 0)!
    const px = paint(key)
    expect(px[0][0]).toBe(css(OCEAN_BANDS[1]))
    expect(px[TILE - 1][TILE - 1]).toBe(css(OCEAN_BANDS[3]))
    for (let x = 0; x < TILE; x++) {
      const column = px.map((row) => row[x])
      const contours = column.filter(
        (c) => c !== css(OCEAN_BANDS[1]) && !OCEAN_BANDS.some((b) => css(b) === c),
      )
      // One contour pixel per band edge crossed (deep to open, open to shelf).
      expect(contours.length).toBe(2)
    }
  })

  it('draws the contour lighter than the band above it, toward the surf', () => {
    const px = paint(chartCellKey(Int8Array.from([0, 0, 1, 1]), 2, 0, 0)!)
    const contour = px.flat().find((c) => c !== css(OCEAN_BANDS[0]) && c !== css(OCEAN_BANDS[1]))!
    const [r, g, b] = contour.match(/\d+/g)!.map(Number)
    const up = OCEAN_BANDS[1]
    expect(r + g + b).toBeGreaterThan(up[0] + up[1] + up[2])
    expect(r).toBeLessThan(OCEAN.surf[0])
  })

  it('leaves the quarters over land and fresh water clear', () => {
    const px = paint(chartCellKey(Int8Array.from([1, -1, 2, 2]), 2, 0, 0)!)
    expect(px[0][TILE - 1]).toBe('')
    expect(px[0][0]).not.toBe('')
    expect(px[TILE - 1][0]).not.toBe('')
  })

  it('places cells between tile centres, never past the outer half tile of the map', () => {
    const width = 3
    const height = 2
    const bands = Int8Array.from([0, 0, 1, 0, 1, 1])
    const at: Array<[number, number]> = []
    forEachChartCell(bands, width, height, (_key, x, y) => at.push([x, y]))
    expect(at).toEqual([
      [TILE / 2, TILE / 2],
      [TILE + TILE / 2, TILE / 2],
    ])
  })
})
