import { TILE_RGB } from '../../model/palette'
import { lineageColor } from '../../../shared/constants'
import { parseColor } from '../cf/overlays/color'

/** The parts of a world the minimap shows: terrain, the living, and the buildings. */
export interface MinimapSource {
  width: number
  height: number
  /** Sim coordinates of grid cell (0, 0). */
  ox: number
  oy: number
  /** Rows of tile ids, tiles[row][col]. */
  tiles: ReadonlyArray<ArrayLike<number>>
  /** Rows of road kinds (0 none, 1 track, 2 bridge), when the frame carries them. */
  roads?: ReadonlyArray<ArrayLike<number>>
  organisms: ReadonlyArray<{ x: number; y: number; lineage_id: string; alive: boolean }>
  buildings: ReadonlyArray<{
    x: number
    y: number
    owner_lineage?: string | null
    lineage_id?: string | null
  }>
}

export type Rgb = readonly [number, number, number]

/** Ground colour for the void (outside the world) and any tile the palette does not know. */
const VOID_RGB: Rgb = [14, 11, 8]

/** Road colours by kind (the simulation's `ROAD_TRACK` and `ROAD_BRIDGE`): a worn dirt track and a plank bridge. */
const ROAD_RGB: Readonly<Record<number, Rgb>> = {
  1: [168, 138, 92],
  2: [120, 92, 58],
}

/** Lineage colours as RGB, from the same palette the map uses for tribes. */
export function lineageRgb(lineageId: string): Rgb {
  const c = parseColor(lineageColor(lineageId))
  return [c.r, c.g, c.b]
}

/** A person or a building is drawn as a block this many pixels square, so it still shows when small. */
const DOT = 2

/**
 * The road kind shown at output pixel (u, v): the most important road in the grid cells it covers (a bridge
 * over a track), so a thin road still shows when the map is much larger than the minimap.
 */
function roadKindIn(src: MinimapSource, u: number, v: number, outW: number, outH: number): number {
  if (!src.roads) return 0
  const c0 = Math.floor((u * src.width) / outW)
  const c1 = Math.max(c0 + 1, Math.floor(((u + 1) * src.width) / outW))
  const r0 = Math.floor((v * src.height) / outH)
  const r1 = Math.max(r0 + 1, Math.floor(((v + 1) * src.height) / outH))
  let kind = 0
  for (let r = r0; r < Math.min(r1, src.height); r++) {
    const row = src.roads[r]
    if (!row) continue
    for (let c = c0; c < Math.min(c1, src.width); c++) {
      const k = row[c] ?? 0
      if (k > kind) kind = k
    }
  }
  return kind
}

/**
 * Paints the whole grid into `out` (outW * outH * 4 bytes, RGBA, row-major), resampled to the
 * size it is shown at. Terrain first, then buildings in their owner's colour, then living people
 * on top, so the tribes stand out on the land. Pure: the colour of a lineage is passed in, so it
 * is testable without a DOM.
 */
export function paintMinimapPixels(
  out: Uint8ClampedArray,
  src: MinimapSource,
  outW: number,
  outH: number,
  colorOf: (lineageId: string) => Rgb = lineageRgb,
): void {
  const { width, height } = src
  if (width <= 0 || height <= 0) return
  if (out.length < outW * outH * 4) throw new Error('minimap buffer is too small for its size')
  for (let v = 0; v < outH; v++) {
    const row = Math.min(height - 1, Math.floor((v * height) / outH))
    const tileRow = src.tiles[row]
    for (let u = 0; u < outW; u++) {
      const col = Math.min(width - 1, Math.floor((u * width) / outW))
      const tile = tileRow ? tileRow[col] : undefined
      const roadKind = roadKindIn(src, u, v, outW, outH)
      const rgb = ROAD_RGB[roadKind] ?? ((tile !== undefined && TILE_RGB[tile]) || VOID_RGB)
      const i = (v * outW + u) * 4
      out[i] = rgb[0]
      out[i + 1] = rgb[1]
      out[i + 2] = rgb[2]
      out[i + 3] = 255
    }
  }
  const colors = new Map<string, Rgb>()
  const tint = (lineage: string): Rgb => {
    let rgb = colors.get(lineage)
    if (rgb === undefined) {
      rgb = colorOf(lineage)
      colors.set(lineage, rgb)
    }
    return rgb
  }
  const put = (x: number, y: number, rgb: Rgb) => {
    const col = Math.floor(x) - src.ox
    const row = Math.floor(y) - src.oy
    if (col < 0 || row < 0 || col >= width || row >= height) return
    const u0 = Math.floor(((col + 0.5) * outW) / width)
    const v0 = Math.floor(((row + 0.5) * outH) / height)
    for (let v = v0; v < Math.min(outH, v0 + DOT); v++) {
      for (let u = u0; u < Math.min(outW, u0 + DOT); u++) {
        const i = (v * outW + u) * 4
        out[i] = rgb[0]
        out[i + 1] = rgb[1]
        out[i + 2] = rgb[2]
      }
    }
  }
  for (const b of src.buildings) {
    const owner = b.owner_lineage ?? b.lineage_id
    if (owner) put(b.x, b.y, tint(owner))
  }
  for (const o of src.organisms) {
    if (o.alive && o.lineage_id) put(o.x, o.y, tint(o.lineage_id))
  }
}
