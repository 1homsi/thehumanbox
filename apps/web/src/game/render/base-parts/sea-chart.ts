import { TILE } from '../../model/palette'
import { OCEAN, type Rgb } from '../art-palette'
import { OCEAN_BANDS, SHALLOWS_BAND, seaBandAt } from '../landscape-style'

/**
 * The sea as a chart: flat depth bands with a thin light contour where one band meets the next.
 *
 * The ground layer fills each sea tile with its band's colour, so on its own a band edge is a
 * staircase of whole tiles. The chart redraws only the cells where bands meet, smoothly: a cell
 * spans the four tile centres around one tile corner (it is offset by half a tile), the band is
 * interpolated between those centres per pixel, and pixels within one pixel of the next band up
 * become the contour. Every cell is painted from its four corner bands alone, so cells are shared
 * through a sprite atlas, and next to a tile centre a cell shows exactly the tile's own band.
 */

/** The band of every tile, row-major, -1 where the tile is not open sea. */
export function seaBands(tiles: number[][], depth: number[][] | undefined, width: number, height: number) {
  const bands = new Int8Array(width * height)
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) bands[row * width + col] = seaBandAt(tiles, depth, row, col)
  }
  return bands
}

/**
 * What the cell between tile centres (col, row) and (col + 1, row + 1) shows, or null when the tile
 * layer under it already shows it (all its sea in one band). The four corner bands, NW NE SW SE,
 * then a bit per corner that is land or fresh water (those quarters stay clear). A clear corner takes
 * the deepest-numbered band of the cell so the bands do not bend toward the shore.
 */
export function chartCellKey(bands: Int8Array, width: number, col: number, row: number): number | null {
  const i = row * width + col
  const nw = bands[i]
  const ne = bands[i + 1]
  const sw = bands[i + width]
  const se = bands[i + width + 1]
  const top = Math.max(nw, ne, sw, se)
  if (top < 0) return null
  const low = Math.min(nw < 0 ? top : nw, ne < 0 ? top : ne, sw < 0 ? top : sw, se < 0 ? top : se)
  if (low === top) return null
  const clear = (nw < 0 ? 1 : 0) | (ne < 0 ? 2 : 0) | (sw < 0 ? 4 : 0) | (se < 0 ? 8 : 0)
  const at = (b: number) => (b < 0 ? top : b)
  return (((at(nw) * 8 + at(ne)) * 8 + at(sw)) * 8 + at(se)) * 16 + clear
}

/** The light contour drawn on a band's edge: the next band up, lifted toward the surf. */
const CONTOUR: readonly Rgb[] = OCEAN_BANDS.map((_, band) => {
  const up = OCEAN_BANDS[Math.min(band + 1, SHALLOWS_BAND)]
  return [0, 1, 2].map((c) => Math.round(up[c] + (OCEAN.surf[c] - up[c]) * 0.2)) as unknown as Rgb
})

const css = (rgb: Rgb) => `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`
const BAND_CSS = OCEAN_BANDS.map(css)
const CONTOUR_CSS = CONTOUR.map(css)

/** Paints the cell `key` (from chartCellKey) with its top-left at (px, py). */
export function paintChartCell(ctx: CanvasRenderingContext2D, key: number, px: number, py: number): void {
  const clear = key & 15
  const se = (key >> 4) & 7
  const sw = (key >> 7) & 7
  const ne = (key >> 10) & 7
  const nw = (key >> 13) & 7
  const half = TILE / 2
  for (let y = 0; y < TILE; y++) {
    const v = (y + 0.5) / TILE
    // Runs of one colour along the row become one rectangle.
    let runStart = 0
    let runStyle = ''
    for (let x = 0; x <= TILE; x++) {
      let style = ''
      if (x < TILE) {
        const quarter = (x < half ? 0 : 1) + (y < half ? 0 : 2)
        if ((clear & (1 << quarter)) === 0) {
          const u = (x + 0.5) / TILE
          const f = (nw * (1 - u) + ne * u) * (1 - v) + (sw * (1 - u) + se * u) * v
          const band = Math.min(SHALLOWS_BAND, Math.floor(f + 0.5))
          // Distance in pixels to the next band up, from the slope of the interpolation.
          const du = ((ne - nw) * (1 - v) + (se - sw) * v) / TILE
          const dv = ((sw - nw) * (1 - u) + (se - ne) * u) / TILE
          const slope = Math.sqrt(du * du + dv * dv)
          const contour = band < SHALLOWS_BAND && slope > 0 && band + 0.5 - f <= slope
          style = contour ? CONTOUR_CSS[band] : BAND_CSS[band]
        }
      }
      if (style === runStyle) continue
      if (runStyle) {
        ctx.fillStyle = runStyle
        ctx.fillRect(px + runStart, py + y, x - runStart, 1)
      }
      runStart = x
      runStyle = style
    }
  }
}

/**
 * Calls `cell(key, x, y)` for every chart cell of the map, with (x, y) its top-left in map pixels.
 * Cells lie between tile centres, so the outer half tile of the map has none (it is all one band).
 */
export function forEachChartCell(
  bands: Int8Array,
  width: number,
  height: number,
  cell: (key: number, x: number, y: number) => void,
): void {
  for (let row = 0; row + 1 < height; row++) {
    for (let col = 0; col + 1 < width; col++) {
      const key = chartCellKey(bands, width, col, row)
      if (key !== null) cell(key, col * TILE + TILE / 2, row * TILE + TILE / 2)
    }
  }
}
