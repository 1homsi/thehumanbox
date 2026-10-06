import { SPRITE_UNTEXTURED, type SpriteLayer } from 'cubeforge'
import { TILE } from '../../../model/palette'
import { TILE_ID } from '../../../model/terrain-ids'
import { paintReed, paintShoreTile, reedAt, shoreTileKey } from '../../decorations'
import { drawFoodPatch, drawMineralOutcrop, visualTileHash } from '../../draw-helpers'
import { buildFoamRects } from '../../foam'
import { paintStructureTile, structureStrength } from '../../structure-marks'
import { CELL_GUTTER, type CellAtlas, type CellRef } from '../atlas/cell-atlas'
import { WHITE, writeSprite, type CfDriver, type CfFrame } from '../frame'
import { packRgba } from '../overlays/color'

/**
 * Cell sizes: a tile plus gutter, and the 14 px cell reeds need (they rise 4 px above their tile
 * and lean sideways).
 */
export const GROUND_CLASSES: ReadonlyArray<readonly [number, number]> = [
  [TILE + 2, TILE + 2],
  [TILE + 6, TILE + 6],
]
/** A reed's marks reach from y -4 and x -1 around the tile's top-left. */
const REED_OFFSET_X = 1
const REED_OFFSET_Y = 3
const REED_CONTENT = TILE + 4

/** Writes one sprite per entry of a list of baked cells, rebuilding the layer from scratch. */
function writeCells(
  layer: SpriteLayer,
  cells: readonly CellRef[],
  pos: readonly number[],
  offsetX: number,
  offsetY: number,
): void {
  const n = cells.length
  layer.resize(n)
  for (let i = 0; i < n; i++) {
    const cell = cells[i]
    writeSprite(
      layer,
      i,
      pos[i * 2] - offsetX - CELL_GUTTER + cell.cw / 2,
      pos[i * 2 + 1] - offsetY - CELL_GUTTER + cell.ch / 2,
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
}

/**
 * Beach banks, shallow-water rims and reeds: the shoreline work that used to be baked into the
 * terrain canvas. One sprite per shore tile, rebuilt when the terrain changes.
 */
export class ShoreDriver {
  stats = { sprites: 0, reeds: 0, rebuilds: 0, rebuildMs: 0 }
  private readonly layer: SpriteLayer
  private readonly atlas: CellAtlas
  private built = -1

  constructor(layer: SpriteLayer, atlas: CellAtlas) {
    this.layer = layer
    this.atlas = atlas
  }

  update(f: CfFrame): boolean {
    if (f.terrainRevision === this.built || f.terrainRevision === 0) return false
    const t0 = performance.now()
    const { tiles, width, height } = f.world.grid
    const biomes = f.biomes
    const { ox, oy } = f
    const cells: CellRef[] = []
    const pos: number[] = []
    let reeds = 0
    for (let pass = 0; pass < 2; pass++) {
      const epoch = this.atlas.epoch
      cells.length = 0
      pos.length = 0
      reeds = 0
      for (let y = 0; y < height; y++) {
        if (!tiles[y]) continue
        for (let x = 0; x < width; x++) {
          const key = shoreTileKey(tiles, biomes, x, y, ox, oy)
          if (key !== null) {
            const cell =
              this.atlas.get(key) ??
              this.atlas.bake(key, TILE, TILE, (ctx) =>
                paintShoreTile(ctx, tiles, biomes, x, y, ox, oy, 0, 0),
              )
            if (cell) {
              cells.push(cell)
              pos.push(x * TILE, y * TILE)
            }
          }
          if (x < 1 || y < 1 || x >= width - 1 || y >= height - 1) continue
          const reed = reedAt(tiles, x, y, ox, oy)
          if (!reed) continue
          const rkey = `R|${reed.edge}|${reed.lean}|${reed.offset}`
          const cell =
            this.atlas.get(rkey) ??
            this.atlas.bake(rkey, REED_CONTENT, REED_CONTENT, (ctx) => {
              ctx.translate(REED_OFFSET_X, REED_OFFSET_Y)
              paintReed(ctx, reed, 0, 0)
            })
          if (!cell) continue
          cells.push(cell)
          pos.push(x * TILE - REED_OFFSET_X, y * TILE - REED_OFFSET_Y)
          reeds++
        }
      }
      if (epoch === this.atlas.epoch) break
    }
    // `pos` holds each cell's content corner, so shore and reed cells share one write.
    writeCells(this.layer, cells, pos, 0, 0)
    this.built = f.terrainRevision
    this.stats = {
      sprites: cells.length,
      reeds,
      rebuilds: this.stats.rebuilds + 1,
      rebuildMs: this.stats.rebuildMs + performance.now() - t0,
    }
    return true
  }
}

/** Food patches and mineral outcrops: small sprites on the tiles that hold them. */
export class PatchDriver {
  stats = { sprites: 0, rebuilds: 0, rebuildMs: 0 }
  private readonly layer: SpriteLayer
  private readonly atlas: CellAtlas
  private built = -1

  constructor(layer: SpriteLayer, atlas: CellAtlas) {
    this.layer = layer
    this.atlas = atlas
  }

  update(f: CfFrame): boolean {
    if (f.terrainRevision === this.built || f.terrainRevision === 0) return false
    const t0 = performance.now()
    const { tiles, width, height } = f.world.grid
    const { ox, oy } = f
    const cells: CellRef[] = []
    const pos: number[] = []
    for (let pass = 0; pass < 2; pass++) {
      const epoch = this.atlas.epoch
      cells.length = 0
      pos.length = 0
      for (let y = 0; y < height; y++) {
        const row = tiles[y]
        if (!row) continue
        for (let x = 0; x < width; x++) {
          const t = row[x]
          if (t !== TILE_ID.FOOD && t !== TILE_ID.MINERAL) continue
          const seed = visualTileHash(x + ox, y + oy)
          const food = t === TILE_ID.FOOD
          // What the painters read from the seed, and nothing else.
          const key = food
            ? `food|${(seed >>> 5) & 3}|${(seed >>> 9) & 3}|${(seed & 7) === 0 ? 1 : 0}|${seed & 1}`
            : `mineral|${seed & 1}`
          const cell =
            this.atlas.get(key) ??
            this.atlas.bake(key, TILE, TILE, (ctx) =>
              food ? drawFoodPatch(ctx, 0, 0, seed) : drawMineralOutcrop(ctx, 0, 0, seed),
            )
          if (!cell) continue
          cells.push(cell)
          pos.push(x * TILE, y * TILE)
        }
      }
      if (epoch === this.atlas.epoch) break
    }
    writeCells(this.layer, cells, pos, 0, 0)
    this.built = f.terrainRevision
    this.stats = {
      sprites: cells.length,
      rebuilds: this.stats.rebuilds + 1,
      rebuildMs: this.stats.rebuildMs + performance.now() - t0,
    }
    return true
  }
}

/**
 * The settlement mark on every tile with built-up structure: a few translucent houses, one cell
 * per distinct strength. The grid arrives with each simulation frame.
 */
export class StructureDriver implements CfDriver {
  stats = { sprites: 0, rebuilds: 0, rebuildMs: 0, scans: 0 }
  private readonly layer: SpriteLayer
  private readonly atlas: CellAtlas
  private frame = -1
  private source: unknown = null
  private revision = -1
  private epoch = -1
  /** The tiles drawn by the last rebuild (row-major index) and their strength in whole percents. */
  private drawnAt = new Int32Array(0)
  private drawnPct = new Uint16Array(0)
  private drawnCount = 0
  private scanAt = new Int32Array(0)
  private scanPct = new Uint16Array(0)
  /** The baked cell of each percent, valid for `epoch`. */
  private readonly cellOf = new Map<number, CellRef>()

  constructor(layer: SpriteLayer, atlas: CellAtlas) {
    this.layer = layer
    this.atlas = atlas
  }

  update(f: CfFrame): boolean {
    const grid = f.world.grid
    const structure = grid.structure
    if (!structure) {
      if (this.layer.count === 0) return false
      this.layer.clear()
      this.layer.touch()
      this.source = null
      this.drawnCount = 0
      return true
    }
    if (
      this.frame === f.world.frame_id &&
      this.source === structure &&
      this.revision === f.terrainRevision &&
      this.epoch === this.atlas.epoch
    )
      return false
    const t0 = performance.now()
    const { tiles, width, height } = grid
    // Every simulation frame brings a structure grid, and it changes in a few tiles at a time. Read it
    // into the list of tiles that show a mark (index and whole percent, which is all a mark is drawn from)
    // and rewrite the layer only when that list differs.
    if (this.scanAt.length < width * height) {
      this.scanAt = new Int32Array(width * height)
      this.scanPct = new Uint16Array(width * height)
    }
    const at = this.scanAt
    const pct = this.scanPct
    let count = 0
    for (let y = 0; y < height; y++) {
      const srow = structure[y]
      const trow = tiles[y]
      if (!srow || !trow) continue
      const base = y * width
      for (let x = 0; x < width; x++) {
        const s = srow[x]
        if (s < 0.05 || trow[x] === 8) continue
        at[count] = base + x
        pct[count++] = Math.round(s * 100)
      }
    }
    this.stats.scans++
    this.frame = f.world.frame_id
    this.source = structure
    if (
      this.revision === f.terrainRevision &&
      this.epoch === this.atlas.epoch &&
      count === this.drawnCount &&
      this.layer.count === count &&
      sameList(this.drawnAt, at, count) &&
      sameList(this.drawnPct, pct, count)
    )
      return false
    // What was scanned is now what is drawn; the old lists become the next scan's scratch.
    ;[this.drawnAt, this.scanAt] = [at, this.drawnAt]
    ;[this.drawnPct, this.scanPct] = [pct, this.drawnPct]
    this.drawnCount = count
    this.revision = f.terrainRevision
    // A page can be cleared while baking (the epoch moves): bake again against the new one.
    for (let pass = 0; pass < 2; pass++) {
      const epoch = this.atlas.epoch
      this.cellOf.clear()
      for (let k = 0; k < count; k++) {
        const p = pct[k]
        if (this.cellOf.has(p)) continue
        const cell =
          this.atlas.get(`St|${p}`) ??
          this.atlas.bake(`St|${p}`, TILE, TILE, (ctx) =>
            paintStructureTile(ctx, 0, 0, structureStrength(p / 100)),
          )
        if (cell) this.cellOf.set(p, cell)
      }
      if (epoch === this.atlas.epoch) break
    }
    const layer = this.layer
    layer.resize(count)
    let k = 0
    for (let i = 0; i < count; i++) {
      const cell = this.cellOf.get(pct[i])
      if (!cell) continue
      const x = at[i] % width
      const y = (at[i] - x) / width
      writeSprite(
        layer,
        k,
        x * TILE - CELL_GUTTER + cell.cw / 2,
        y * TILE - CELL_GUTTER + cell.ch / 2,
        cell.cw,
        cell.ch,
        cell.atlas,
        cell.frame,
        WHITE,
        0,
        0,
        k,
      )
      k++
    }
    // A tile whose cell could not be baked (the atlas is full) is skipped, as before.
    layer.resize(k)
    layer.touch()
    this.epoch = this.atlas.epoch
    this.stats = {
      sprites: k,
      rebuilds: this.stats.rebuilds + 1,
      rebuildMs: this.stats.rebuildMs + performance.now() - t0,
      scans: this.stats.scans,
    }
    return true
  }
}

function sameList(a: ArrayLike<number>, b: ArrayLike<number>, n: number): boolean {
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return false
  return true
}

/** Whitecaps on the shore: a thin line that stays, and thick breakers that pulse in four phases. */
export class FoamDriver implements CfDriver {
  stats = { rects: 0, rebuilds: 0 }
  private readonly layer: SpriteLayer
  private built = -1
  /** Sprite index where each thick bucket starts; `starts[4]` is the end. */
  private starts = [0, 0, 0, 0, 0]
  private lastColors = [-1, -1, -1, -1]

  constructor(layer: SpriteLayer) {
    this.layer = layer
  }

  update(f: CfFrame): boolean {
    let changed = false
    if (f.terrainRevision !== this.built && f.terrainRevision !== 0) {
      const { tiles, width, height } = f.world.grid
      const foam = buildFoamRects(tiles, width, height)
      const layer = this.layer
      const thin = foam.thin
      const total = thin.length / 4 + foam.thick.reduce((n, b) => n + b.length / 4, 0)
      layer.resize(total)
      let i = 0
      const put = (rects: readonly number[], color: number) => {
        for (let k = 0; k < rects.length; k += 4, i++) {
          layer.x[i] = rects[k] + rects[k + 2] / 2
          layer.y[i] = rects[k + 1] + rects[k + 3] / 2
          layer.w[i] = rects[k + 2]
          layer.h[i] = rects[k + 3]
          layer.flags[i] = SPRITE_UNTEXTURED
          layer.color[i] = color
          layer.atlas[i] = 0
          layer.frame[i] = 0
          layer.sortKey[i] = 0
          layer.ids[i] = i
          layer.rotation[i] = 0
        }
      }
      put(thin, packRgba(255, 255, 255, 0.3))
      this.starts[0] = i
      for (let b = 0; b < 4; b++) {
        put(foam.thick[b], 0)
        this.starts[b + 1] = i
      }
      this.lastColors = [-1, -1, -1, -1]
      this.built = f.terrainRevision
      this.stats = { rects: total, rebuilds: this.stats.rebuilds + 1 }
      changed = true
    }
    if (this.layer.count === 0) return changed
    const foamT = f.now * 0.0014
    const layer = this.layer
    for (let b = 0; b < 4; b++) {
      const pulse = Math.sin(foamT + (b * Math.PI) / 2)
      const alpha = pulse <= 0.25 ? 0 : 0.55 * Math.min(1, (pulse - 0.25) / 0.75)
      const color = packRgba(255, 255, 255, alpha)
      if (color === this.lastColors[b]) continue
      this.lastColors[b] = color
      layer.color.fill(color, this.starts[b], this.starts[b + 1])
      changed = true
    }
    if (changed) layer.touch()
    return changed
  }
}
