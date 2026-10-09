import type { SpriteLayer } from 'xipjs'
import { TILE } from '../../../model/palette'
import { paintDecorTile } from '../../decorations'
import { CELL_GUTTER, type CellAtlas, type CellRef } from '../atlas/cell-atlas'
import { WHITE, writeSprite, type CfFrame } from '../frame'
import { createProbe } from './draw-probe'

/** Decor marks reach from x -1..11 and y -3..9 around the tile's top-left (measured). */
const OFFSET_X = 1
const OFFSET_Y = 3
const CONTENT = 12
/** Cell classes: content plus gutter. */
export const DECOR_CLASSES: ReadonlyArray<readonly [number, number]> = [[CONTENT + 2, CONTENT + 2]]

/** Scattered ground detail (rocks, flowers, tufts, mushrooms, ...): one small sprite per decorated tile. */
export class DecorDriver {
  stats = { sprites: 0, rebuilds: 0, rebuildMs: 0 }
  private readonly layer: SpriteLayer
  private readonly atlas: CellAtlas
  private readonly probe = createProbe()
  private cells: CellRef[] = []
  private pos: number[] = []

  constructor(layer: SpriteLayer, atlas: CellAtlas) {
    this.layer = layer
    this.atlas = atlas
  }

  rebuild(f: CfFrame): void {
    const t0 = performance.now()
    const { tiles, width, height } = f.world.grid
    const biomes = f.biomes
    if (!biomes) return
    const { ox, oy } = f
    const probe = this.probe
    for (let pass = 0; pass < 2; pass++) {
      const epoch = this.atlas.epoch
      const cells = this.cells
      const pos = this.pos
      cells.length = 0
      pos.length = 0
      for (let y = 1; y < height - 1; y++) {
        const row = tiles[y]
        const bRow = biomes[y]
        if (!row || !bRow) continue
        for (let x = 1; x < width - 1; x++) {
          const t = row[x]
          const biome = bRow[x] ?? 0
          probe.reset()
          paintDecorTile(probe.ctx, t, biome, x + ox, y + oy, 0, 0)
          if (!probe.drew) continue
          // Tiles that made the same calls share a cell: a quarter as many cells as decorated tiles.
          const key = `D|${probe.signature()}`
          const cell =
            this.atlas.get(key) ??
            this.atlas.bake(key, CONTENT, CONTENT, (ctx) => {
              ctx.translate(OFFSET_X, OFFSET_Y)
              paintDecorTile(ctx, t, biome, x + ox, y + oy, 0, 0)
            })
          if (!cell) continue
          cells.push(cell)
          pos.push(x, y)
        }
      }
      if (epoch === this.atlas.epoch) break
    }
    const n = this.cells.length
    const layer = this.layer
    layer.resize(n)
    for (let i = 0; i < n; i++) {
      const cell = this.cells[i]
      const px = this.pos[i * 2] * TILE
      const py = this.pos[i * 2 + 1] * TILE
      writeSprite(
        layer,
        i,
        px - OFFSET_X - CELL_GUTTER + cell.cw / 2,
        py - OFFSET_Y - CELL_GUTTER + cell.ch / 2,
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
    this.stats.sprites = n
    this.stats.rebuilds++
    this.stats.rebuildMs += performance.now() - t0
  }
}
