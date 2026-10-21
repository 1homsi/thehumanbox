import type { SpriteLayer } from 'xipjs'
import { TILE } from '../../../model/palette'
import { forEachChartCell, paintChartCell, seaBands } from '../../base-parts/sea-chart'
import { CELL_GUTTER, type CellAtlas, type CellRef } from '../atlas/cell-atlas'
import { WHITE, writeSprite, type CfDriver, type CfFrame } from '../frame'

/**
 * The sea chart's band edges and contours (base-parts/sea-chart.ts): one sprite per cell where two
 * depth bands meet, rebuilt when the terrain or the depth map changes.
 */
export class SeaChartDriver implements CfDriver {
  stats = { sprites: 0, rebuilds: 0, rebuildMs: 0 }
  private readonly layer: SpriteLayer
  private readonly atlas: CellAtlas
  private built = -1
  /** Depth arrives only with full frames; delta frames reuse the last one. */
  private depth: number[][] | undefined
  private builtDepth: number[][] | undefined

  constructor(layer: SpriteLayer, atlas: CellAtlas) {
    this.layer = layer
    this.atlas = atlas
  }

  update(f: CfFrame): boolean {
    const grid = f.world.grid
    if (grid.depth_map) this.depth = grid.depth_map as number[][]
    if (f.terrainRevision === 0) return false
    if (f.terrainRevision === this.built && this.depth === this.builtDepth) return false
    const t0 = performance.now()
    const { tiles, width, height } = grid
    const bands = seaBands(tiles, this.depth, width, height)
    const cells: CellRef[] = []
    const pos: number[] = []
    for (let pass = 0; pass < 2; pass++) {
      const epoch = this.atlas.epoch
      cells.length = 0
      pos.length = 0
      forEachChartCell(bands, width, height, (key, x, y) => {
        const name = `C|${key}`
        const cell =
          this.atlas.get(name) ?? this.atlas.bake(name, TILE, TILE, (ctx) => paintChartCell(ctx, key, 0, 0))
        if (!cell) return
        cells.push(cell)
        pos.push(x, y)
      })
      if (epoch === this.atlas.epoch) break
    }
    const layer = this.layer
    const n = cells.length
    layer.resize(n)
    for (let i = 0; i < n; i++) {
      const cell = cells[i]
      writeSprite(
        layer,
        i,
        pos[i * 2] - CELL_GUTTER + cell.cw / 2,
        pos[i * 2 + 1] - CELL_GUTTER + cell.ch / 2,
        cell.cw,
        cell.ch,
        cell.atlas,
        cell.frame,
        WHITE,
        0,
        0,
        i,
      )
    }
    layer.touch()
    this.built = f.terrainRevision
    this.builtDepth = this.depth
    this.stats = {
      sprites: n,
      rebuilds: this.stats.rebuilds + 1,
      rebuildMs: this.stats.rebuildMs + performance.now() - t0,
    }
    return true
  }
}
