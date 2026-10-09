import type { SpriteLayer } from 'xipjs'
import { TILE } from '../../../model/palette'
import { BIOME_ID } from '../../../model/terrain-ids'
import { landscapeHash } from '../../landscape-style'
import { drawMassTile, mountainHeights } from '../../mountains'
import { CELL_GUTTER, type CellAtlas, type CellRef } from '../atlas/cell-atlas'
import { WHITE, writeSprite, type CfFrame } from '../frame'

/** A mountain tile is 8x8 with a 2px cliff shadow on the lowland below it. */
const CONTENT_W = TILE
const CONTENT_H = TILE + 2
export const MOUNTAIN_CLASSES: ReadonlyArray<readonly [number, number]> = [[CONTENT_W + 2, CONTENT_H + 2]]

/** The sculpted mountain mass: one sprite per rock or snow tile of a range. */
export class MountainsDriver {
  stats = { sprites: 0, rebuilds: 0, rebuildMs: 0 }
  private readonly layer: SpriteLayer
  private readonly atlas: CellAtlas
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
    const { ox, oy } = f
    const h = mountainHeights(tiles, width, height)
    for (let pass = 0; pass < 2; pass++) {
      const epoch = this.atlas.epoch
      this.cells.length = 0
      this.pos.length = 0
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const here = h[y * width + x]
          if (here === 0) continue
          const volcanic = biomes?.[y]?.[x] === BIOME_ID.VOLCANIC
          const north = y > 0 ? h[(y - 1) * width + x] : 0
          const south = y + 1 < height ? h[(y + 1) * width + x] : 0
          const west = x > 0 ? h[y * width + x - 1] : 0
          const east = x + 1 < width ? h[y * width + x + 1] : 0
          // Everything drawMassTile reads from the neighbourhood, plus the tile's hash.
          const sig =
            here * 64 +
            (north > here ? 32 : north < here ? 16 : 0) +
            (west < here ? 8 : 0) +
            (east < here ? 4 : 0) +
            (south === 0 ? 2 : 0) +
            (volcanic ? 1 : 0)
          const key = `M|${x + ox}|${y + oy}|${sig}`
          const cell =
            this.atlas.get(key) ??
            this.atlas.bake(key, CONTENT_W, CONTENT_H, (ctx) =>
              drawMassTile(ctx, h, width, height, x, y, volcanic, landscapeHash(x + ox, y + oy), 0, 0),
            )
          if (!cell) continue
          this.cells.push(cell)
          this.pos.push(x, y)
        }
      }
      if (epoch === this.atlas.epoch) break
    }
    const n = this.cells.length
    const layer = this.layer
    layer.resize(n)
    for (let i = 0; i < n; i++) {
      const cell = this.cells[i]
      writeSprite(
        layer,
        i,
        this.pos[i * 2] * TILE - CELL_GUTTER + cell.cw / 2,
        this.pos[i * 2 + 1] * TILE - CELL_GUTTER + cell.ch / 2,
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
