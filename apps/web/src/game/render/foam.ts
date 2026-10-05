import {
  EDGE_EAST,
  EDGE_NORTH,
  EDGE_SOUTH,
  EDGE_WEST,
  permanentWaterLandEdgeMask,
} from '../model/terrain-visuals'
import { TILE } from '../model/palette'

/** Shore foam as flat `x, y, w, h` rectangles in map pixels. */
export interface FoamRects {
  /** The thin white line along every shore edge. */
  thin: number[]
  /** The thick breakers, split four ways by tile hash so they can pulse out of step. */
  thick: [number[], number[], number[], number[]]
}

/**
 * Where the foam goes: along every edge where permanent water meets land. The geometry depends
 * on the terrain grid only, so it is built once per terrain change.
 */
export function buildFoamRects(tiles: number[][], width: number, height: number): FoamRects {
  const thin: number[] = []
  const thick: FoamRects['thick'] = [[], [], [], []]
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const shore = permanentWaterLandEdgeMask(tiles, row, col)
      if (shore === 0) continue
      const px = col * TILE
      const py = row * TILE
      let h = (col * 374761393 + row * 668265263) | 0
      h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0
      const tp = thick[h & 3]
      if (shore & EDGE_NORTH) {
        thin.push(px, py, TILE, 1)
        tp.push(px, py, TILE, 2)
      }
      if (shore & EDGE_SOUTH) {
        thin.push(px, py + TILE - 1, TILE, 1)
        tp.push(px, py + TILE - 2, TILE, 2)
      }
      if (shore & EDGE_EAST) {
        thin.push(px + TILE - 1, py, 1, TILE)
        tp.push(px + TILE - 2, py, 2, TILE)
      }
      if (shore & EDGE_WEST) {
        thin.push(px, py, 1, TILE)
        tp.push(px, py, 2, TILE)
      }
    }
  }
  return { thin, thick }
}
