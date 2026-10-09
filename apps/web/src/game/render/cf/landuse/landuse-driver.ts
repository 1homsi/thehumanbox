import type { SpriteLayer } from 'xipjs'
import { farmCropColor, farmProgress, farmStage } from '../../../model/farms'
import { TILE } from '../../../model/palette'
import { paintFarmTile } from './farm-tile'
import { PLANT_KIND, drawPlanting } from '../../plantings'
import { CELL_GUTTER, type CellAtlas } from '../atlas/cell-atlas'
import { WHITE, writeSprite, type CfDriver, type CfFrame } from '../frame'

/** Farm plots and plantings are 8x8 tiles. */
export const LANDUSE_CLASSES: ReadonlyArray<readonly [number, number]> = [[TILE + 2, TILE + 2]]

/**
 * Farms and player plantings (crops, orchards, saplings, flowers): one 8x8 sprite per
 * tile. A look is painted once per distinct state (stage, growth step, crop colour, and
 * for ripe fields and flower beds the tile's own hashed scatter).
 * Railways, trains and trade roads stay on the canvas: they are lines, not sprites.
 */
export class LanduseDriver implements CfDriver {
  stats = { farms: 0, plantings: 0, updates: 0, ms: 0 }
  private readonly layer: SpriteLayer
  private readonly atlas: CellAtlas
  private sig = ''

  constructor(layer: SpriteLayer, atlas: CellAtlas) {
    this.layer = layer
    this.atlas = atlas
  }

  update(f: CfFrame): boolean {
    const { world, win, ox, oy } = f
    const farms = world.farms ?? []
    const flat = world.plantings ?? []
    const sig = `${world.frame_id}|${farms.length}|${flat.length}|${world.tick}|${win.c0},${win.c1},${win.r0},${win.r1}|${this.atlas.epoch}`
    if (sig === this.sig) return false
    const t0 = performance.now()
    const layer = this.layer
    const { c0, c1, r0, r1 } = win
    layer.resize(farms.length + flat.length / 4)
    let n = 0
    let nf = 0
    let np = 0
    for (const farm of farms) {
      const lx = farm.x - ox
      const ly = farm.y - oy
      if (lx < c0 - 1 || lx > c1 || ly < r0 - 1 || ly > r1) continue
      const stage = farmStage(farm, world.tick)
      const grown = Math.max(1, Math.round(1 + farmProgress(farm, world.tick) * 4))
      const color = farmCropColor(farm.crop)
      const offset = (farm.crop?.length ?? 0) % 2
      const key = `F|${stage}|${grown}|${color}|${offset}`
      const cell =
        this.atlas.get(key) ??
        this.atlas.bake(key, TILE, TILE, (ctx) =>
          paintFarmTile(ctx, 0, 0, stage, (grown - 1) / 4, color, offset),
        )
      if (!cell) continue
      writeSprite(
        layer,
        n++,
        lx * TILE - CELL_GUTTER + cell.cw / 2,
        ly * TILE - CELL_GUTTER + cell.ch / 2,
        cell.cw,
        cell.ch,
        cell.atlas,
        cell.frame,
        WHITE,
        0,
        0,
        0,
      )
      nf++
    }
    for (let i = 0; i + 3 < flat.length; i += 4) {
      const lx = flat[i]! - ox
      const ly = flat[i + 1]! - oy
      if (lx < c0 - 1 || lx > c1 || ly < r0 - 1 || ly > r1) continue
      const kind = flat[i + 2]!
      const stage = flat[i + 3]!
      // Ripe fields and flower beds scatter pixels from the tile's position.
      const hashed = (kind === PLANT_KIND.CROP && stage === 4) || kind === PLANT_KIND.FLOWER
      const key = `P|${kind}|${stage}${hashed ? `|${lx * TILE},${ly * TILE}` : ''}`
      const cell =
        this.atlas.get(key) ??
        this.atlas.bake(key, TILE, TILE, (ctx) => {
          // The painter hashes its pixel position: paint at the real one, shifted into the cell.
          ctx.translate(-lx * TILE, -ly * TILE)
          drawPlanting(ctx, lx * TILE, ly * TILE, kind, stage)
        })
      if (!cell) continue
      writeSprite(
        layer,
        n++,
        lx * TILE - CELL_GUTTER + cell.cw / 2,
        ly * TILE - CELL_GUTTER + cell.ch / 2,
        cell.cw,
        cell.ch,
        cell.atlas,
        cell.frame,
        WHITE,
        0,
        0,
        0,
      )
      np++
    }
    layer.resize(n)
    layer.touch()
    this.sig = sig.slice(0, sig.lastIndexOf('|') + 1) + this.atlas.epoch
    this.stats = {
      farms: nf,
      plantings: np,
      updates: this.stats.updates + 1,
      ms: this.stats.ms + performance.now() - t0,
    }
    return true
  }
}
