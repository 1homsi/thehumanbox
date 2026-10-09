import { describe, expect, it } from 'vitest'
import { TILE } from '../../../model/palette'
import { TILE_ID } from '../../../model/terrain-ids'
import { EDGE_EAST, EDGE_NORTH, EDGE_SOUTH, EDGE_WEST } from '../../../model/terrain-visuals'
import { dryEdges, foamCrest, paintFloodFront } from './flood-front'

/** Records every rectangle and the alpha it was drawn with. */
function recordingContext() {
  const rects: { x: number; y: number; w: number; h: number; alpha: number; fill: string }[] = []
  const ctx = {
    save() {},
    restore() {},
    globalAlpha: 1,
    fillStyle: '',
    fillRect(x: number, y: number, w: number, h: number) {
      rects.push({ x, y, w, h, alpha: this.globalAlpha, fill: this.fillStyle })
    },
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, rects }
}

/** A 5x5 grid: a flood in the middle (rows 1-3, cols 1-3), dry land around it. */
function floodGrid(): number[][] {
  const grid: number[][] = []
  for (let r = 0; r < 5; r++) {
    const row: number[] = []
    for (let c = 0; c < 5; c++) {
      const inside = r >= 1 && r <= 3 && c >= 1 && c <= 3
      row.push(inside ? TILE_ID.FLOODED : TILE_ID.GRASS)
    }
    grid.push(row)
  }
  return grid
}

const VIEW = { c0: 0, c1: 5, r0: 0, r1: 5, ox: 0, oy: 0 }

describe('dryEdges', () => {
  it('marks the sides of a flooded cell that touch dry land', () => {
    const tiles = floodGrid()
    expect(dryEdges(tiles, 1, 1)).toBe(EDGE_NORTH | EDGE_WEST)
    expect(dryEdges(tiles, 2, 2)).toBe(0)
    expect(dryEdges(tiles, 1, 2)).toBe(EDGE_NORTH)
    expect(dryEdges(tiles, 3, 3)).toBe(EDGE_SOUTH | EDGE_EAST)
  })

  it('does not count water or the edge of the grid as a front', () => {
    const tiles = floodGrid()
    tiles[0][1] = TILE_ID.WATER
    expect(dryEdges(tiles, 1, 1)).toBe(EDGE_WEST)
    expect(dryEdges([[TILE_ID.FLOODED]], 0, 0)).toBe(0)
  })
})

describe('foamCrest', () => {
  it('is in 0..1 and moves on with the clock', () => {
    for (let t = 0; t < 5000; t += 137) {
      const v = foamCrest(2, 3, t)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
    expect(foamCrest(2, 3, 1000)).not.toBe(foamCrest(2, 3, 1400))
  })

  it('rolls: a cell further along the diagonal peaks at a later time', () => {
    const peakAt = (row: number, col: number) => {
      let best = 0
      let bestT = 0
      for (let t = 0; t < 4000; t += 10) {
        const v = foamCrest(row, col, t)
        if (v > best) {
          best = v
          bestT = t
        }
      }
      return bestT
    }
    expect(peakAt(0, 6)).toBeGreaterThan(peakAt(0, 0))
  })
})

describe('paintFloodFront', () => {
  it('paints the sheen on every flooded cell and nothing on dry land', () => {
    const { ctx, rects } = recordingContext()
    paintFloodFront(ctx, floodGrid(), VIEW, 0)
    const sheen = rects.filter((r) => r.w === TILE && r.h === TILE)
    expect(sheen).toHaveLength(9)
    for (const r of sheen) {
      expect(r.x).toBeGreaterThanOrEqual(TILE)
      expect(r.y).toBeGreaterThanOrEqual(TILE)
    }
  })

  it('paints foam only on the flooded side of a dry edge, and only at the crest', () => {
    const { ctx, rects } = recordingContext()
    paintFloodFront(ctx, floodGrid(), VIEW, 0)
    const foam = rects.filter((r) => r.fill === '#eaf6ff')
    expect(foam.length).toBeGreaterThan(0)
    for (const r of foam) {
      const onEdge = r.w === 3 || r.h === 3
      expect(onEdge).toBe(true)
      expect(r.alpha).toBeGreaterThan(0)
    }
    // The centre cell (2, 2) has no dry neighbour, so no foam there.
    expect(foam.some((r) => r.x >= 2 * TILE && r.x < 3 * TILE && r.y >= 2 * TILE && r.y < 3 * TILE)).toBe(
      false,
    )
  })

  it('uses the view offset, so cells map to the same pixels as the other ground layers', () => {
    const { ctx, rects } = recordingContext()
    // Grid origin at sim tile (10, 20): the flood sits at sim tiles x 11-13, y 21-23.
    paintFloodFront(ctx, floodGrid(), { c0: 10, c1: 15, r0: 20, r1: 25, ox: 10, oy: 20 }, 0)
    const sheen = rects.filter((r) => r.w === TILE && r.h === TILE)
    expect(sheen).toHaveLength(9)
    expect(Math.min(...sheen.map((r) => r.x))).toBe(TILE)
    expect(Math.min(...sheen.map((r) => r.y))).toBe(TILE)
  })

  it('does nothing without a grid', () => {
    const { ctx, rects } = recordingContext()
    paintFloodFront(ctx, undefined, VIEW, 0)
    expect(rects).toHaveLength(0)
  })
})
