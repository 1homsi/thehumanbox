import type { SpriteLayer } from 'cubeforge'
import { TILE } from '../../../model/palette'
import { CELL_GUTTER, type CellAtlas } from '../atlas/cell-atlas'
import { WHITE, writeSprite, type CfDriver, type CfFrame } from '../frame'
import {
  ROAD_BRIDGE,
  ROAD_TRACK,
  bridgeCellKey,
  bridgeIsVertical,
  paintBridgeCell,
  paintRoadCell,
  roadCellKey,
  roadMask,
  roadStyle,
} from './road-art'

/** Road cells are one tile each, gutter included (the atlas adds the gutter to the class). */
export const ROAD_CLASSES: ReadonlyArray<readonly [number, number]> = [[TILE + 2, TILE + 2]]

/** A drawn cell's code: its road kind above the four join bits. */
const JOIN_BITS = 0xf

/**
 * Roads and bridges on the ground: one tile sprite per road cell in the visible window, joined to its
 * neighbours and drawn in the style of the era. The simulation sends the road kinds on each static
 * frame, so the layer is rewritten only when that revision, the era, the window or the atlas changes.
 */
export class RoadDriver implements CfDriver {
  stats = { roads: 0, rebuilds: 0, ms: 0 }
  private readonly layer: SpriteLayer
  private readonly atlas: CellAtlas
  private sig = ''
  private cells: number[] = []
  private codes: number[] = []

  constructor(layer: SpriteLayer, atlas: CellAtlas) {
    this.layer = layer
    this.atlas = atlas
  }

  update(f: CfFrame): boolean {
    const grid = f.world.grid
    const roads = grid.roads
    if (!roads) {
      if (this.layer.count === 0) return false
      this.layer.clear()
      this.layer.touch()
      this.sig = ''
      return true
    }
    const style = roadStyle(f.world.current_era)
    const revision = grid.road_revision ?? 0
    const { c0, c1, r0, r1 } = f.win
    const sig = `${revision}|${style}|${c0},${c1},${r0},${r1}|${this.atlas.epoch}`
    if (sig === this.sig) return false
    const t0 = performance.now()
    this.sig = sig
    const cells = this.cells
    const codes = this.codes
    cells.length = 0
    codes.length = 0
    for (let r = Math.max(0, r0); r < Math.min(grid.height, r1); r++) {
      const row = roads[r]
      if (!row) continue
      for (let c = Math.max(0, c0); c < Math.min(grid.width, c1); c++) {
        const kind = row[c]
        if (kind !== ROAD_TRACK && kind !== ROAD_BRIDGE) continue
        cells.push(r * grid.width + c)
        codes.push((kind << 4) | roadMask(roads, r, c))
      }
    }
    this.layer.resize(cells.length)
    let n = 0
    for (let i = 0; i < cells.length; i++) {
      const idx = cells[i]!
      const code = codes[i]!
      const kind = code >> 4
      const mask = code & JOIN_BITS
      const r = Math.floor(idx / grid.width)
      const c = idx - r * grid.width
      let key: string
      let paint: (ctx: CanvasRenderingContext2D) => void
      if (kind === ROAD_BRIDGE) {
        const vertical = bridgeIsVertical(mask)
        key = bridgeCellKey(vertical)
        paint = (ctx) => paintBridgeCell(ctx, vertical)
      } else {
        key = roadCellKey(style, mask)
        paint = (ctx) => paintRoadCell(ctx, style, mask)
      }
      const cell = this.atlas.get(key) ?? this.atlas.bake(key, TILE, TILE, paint)
      if (!cell) continue
      writeSprite(
        this.layer,
        n++,
        c * TILE - CELL_GUTTER + cell.cw / 2,
        r * TILE - CELL_GUTTER + cell.ch / 2,
        cell.cw,
        cell.ch,
        cell.atlas,
        cell.frame,
        WHITE,
        0,
        0,
        0,
      )
    }
    this.layer.resize(n)
    this.layer.touch()
    this.stats = { roads: n, rebuilds: this.stats.rebuilds + 1, ms: performance.now() - t0 }
    return true
  }
}
