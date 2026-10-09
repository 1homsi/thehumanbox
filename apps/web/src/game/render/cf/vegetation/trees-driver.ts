import { SPRITE_UNTEXTURED, type SpriteLayer } from 'xipjs'
import { LOW_PERF } from '../../../../shared/perf'
import { ATLAS_TOWN, SPRITE, drawTile } from '../../../../shared/sprites'
import type { WorldState } from '../../../../shared/types'
import { TILE } from '../../../model/palette'
import { drawAcacia, placeTrees, type PlacedAcacia, type PlacedTree } from '../../decorations'
import {
  drawVegetationCrop,
  vegetationAtlasReady,
  vegetationPlacement,
  type VegetationPlacement,
} from '../../vegetation-sprites'
import { CELL_GUTTER, type CellAtlas, type CellRef } from '../atlas/cell-atlas'
import { castSun } from './cast-shadows'
import { crownSpeck, dressingFor } from './tree-dressing'
import { WHITE, rgba, writeSprite, type CfFrame } from '../frame'

/** Cell classes: a tree is at most ~32px square, an acacia 24x20. */
export const TREE_CLASSES: ReadonlyArray<readonly [number, number]> = [
  [26, 22],
  [34, 34],
]

const SHADOW = rgba(20, 24, 18, Math.round(0.24 * 255))

/**
 * The wind moves a canopy by whole pixels along a slow sine (a period of four seconds): a pixel flips a
 * few times a second at most, so the canopies are rewritten about 12 times a second, not every frame.
 */
const SWAY_INTERVAL_MS = 80

/** A tree as it will draw: its sprite cell and the pixel position the canvas painter used. */
interface TreeSprite {
  /** Whole-pixel top-left of the sprite and its size. */
  dx: number
  dy: number
  w: number
  h: number
  cell: CellRef
  sortKey: number
  /** Atlas-tile fallback or vegetation crop. */
  crop: VegetationPlacement | null
  tile: readonly [number, number]
  /** Leaves sway; cacti and dead trees stay put. */
  sways: boolean
  phase: number
  cx: number
  cy: number
  sz: number
}

/**
 * Trees, their ground shadows and savanna acacias as one depth-sorted SpriteLayer,
 * rebuilt when the terrain changes, plus the wind: the canvas painter redraws the
 * visible canopies a pixel or two aside every frame, here a small overlay layer
 * holds those canopy-only sprites.
 */
export class TreesDriver {
  stats = { trees: 0, acacias: 0, sway: 0, rebuilds: 0, rebuildMs: 0, swayMs: 0, placeMs: 0 }
  private readonly layer: SpriteLayer
  private readonly swayLayer: SpriteLayer
  /** Long shadows thrown by the sun, under the trees (rewritten as the sun moves). */
  private readonly castLayer: SpriteLayer
  private castKey = ''
  /** Seasonal specks on the crowns (blossom, leaves, snow), above the trees. */
  private readonly dressLayer: SpriteLayer
  private season = ''
  private readonly atlas: CellAtlas
  private sprites: TreeSprite[] = []
  /** Sorted by bottom edge, for a visible-range scan each frame. */
  private bottoms: number[] = []
  private canopyCells = new Map<string, CellRef>()
  private canopyEpoch = -1
  private cellByKey = new Map<string, CellRef>()
  private lastSwayAt = -Infinity
  private swayKey = ''
  /** Scratch for the visible canopies of one frame: tree index and pixel shift. */
  private picked = new Int32Array(0)
  private shifts = new Int8Array(0)

  constructor(
    layer: SpriteLayer,
    swayLayer: SpriteLayer,
    atlas: CellAtlas,
    castLayer: SpriteLayer,
    dressLayer: SpriteLayer,
  ) {
    this.layer = layer
    this.swayLayer = swayLayer
    this.castLayer = castLayer
    this.dressLayer = dressLayer
    this.atlas = atlas
  }

  /** The atlases the canvas painter needs are images that load after the page does. */
  ready(): boolean {
    return ATLAS_TOWN.complete && ATLAS_TOWN.naturalWidth > 0 && vegetationAtlasReady()
  }

  rebuild(f: CfFrame, season: string): void {
    const t0 = performance.now()
    this.season = season
    const biomes = f.biomes
    const { tiles, width, height } = f.world.grid
    if (!biomes) return
    const p0 = performance.now()
    const placed = placeTrees(width, height, tiles, biomes, f.ox, f.oy, undefined, season)
    this.stats.placeMs += performance.now() - p0
    for (let pass = 0; pass < 2; pass++) {
      const epoch = this.atlas.epoch
      this.cellByKey.clear()
      this.build(placed.trees, placed.acacias)
      if (epoch === this.atlas.epoch) break
    }
    this.stats.rebuilds++
    this.stats.rebuildMs += performance.now() - t0
    // The sprites the wind copies from are new.
    this.lastSwayAt = -Infinity
  }

  private treeSprite(tree: PlacedTree): TreeSprite | null {
    const { cx, cy, sz, sprite } = tree
    const crop = vegetationPlacement(sprite, cx, cy, sz)
    let dx: number
    let dy: number
    let w: number
    let h: number
    let key: string
    if (crop) {
      dx = crop.dx
      dy = crop.dy
      w = crop.width
      h = crop.height
      key = `V|${sprite[0]},${sprite[1]}|${w}x${h}`
    } else {
      dx = Math.round(cx)
      dy = Math.round(cy)
      w = h = Math.round(sz)
      key = `T|${sprite[0]},${sprite[1]}|${w}`
    }
    let cell = this.cellByKey.get(key) ?? this.atlas.get(key)
    if (!cell) {
      cell =
        this.atlas.bake(key, w, h, (ctx) => {
          if (crop) drawVegetationCrop(ctx, crop, 0, 0)
          else drawTile(ctx, ATLAS_TOWN, sprite, 0, 0, w)
        }) ?? undefined
    }
    if (!cell) return null
    this.cellByKey.set(key, cell)
    return {
      dx,
      dy,
      w,
      h,
      cell,
      sortKey: cy + sz,
      crop,
      tile: sprite,
      sways: sprite !== SPRITE.trees.cactus && sprite !== SPRITE.trees.dead,
      phase: cx * 0.13 + cy * 0.071,
      cx,
      cy,
      sz,
    }
  }

  private acaciaCell(a: PlacedAcacia): { cell: CellRef; x: number; y: number } | null {
    const cx = Math.round(a.x)
    const by = Math.round(a.y)
    const trunk = Math.round(9 * Math.min(1.3, a.s))
    const half = Math.round(8 * Math.min(1.3, a.s))
    const key = `A|${trunk}|${half}`
    // Content: x from cx-half to cx+half, y from the canopy top (by-trunk-4) to the shadow (by+1).
    const w = half * 2 + 1
    const top = trunk + 4
    const h = top + 2
    let cell = this.cellByKey.get(key) ?? this.atlas.get(key)
    if (!cell) {
      cell = this.atlas.bake(key, w, h, (ctx) => drawAcacia(ctx, half, top, a.s)) ?? undefined
    }
    if (!cell) return null
    this.cellByKey.set(key, cell)
    return { cell, x: cx - half, y: by - top }
  }

  private build(trees: PlacedTree[], acacias: PlacedAcacia[]): void {
    const layer = this.layer
    const sprites: TreeSprite[] = []
    for (const tree of trees) {
      const s = this.treeSprite(tree)
      if (s) sprites.push(s)
    }
    const acaciaCells: Array<{ cell: CellRef; x: number; y: number; key: number }> = []
    for (const a of acacias) {
      const c = this.acaciaCell(a)
      if (c) acaciaCells.push({ ...c, key: 1e5 + a.y })
    }
    this.sprites = sprites
    this.castKey = ''
    this.bottoms = sprites.map((s) => s.sortKey)
    const n = sprites.length * 2 + acaciaCells.length
    layer.resize(n)
    let i = 0
    // Every shadow lies under every tree, as the canvas painter drew them.
    for (const s of sprites) {
      const sw = Math.max(4, Math.round(s.sz * 0.48))
      const sh = Math.max(1, Math.round(s.sz * 0.1))
      const x = Math.round(s.cx + (s.sz - sw) / 2)
      const y = Math.round(s.cy + s.sz * 0.88)
      writeSprite(layer, i++, x + sw / 2, y + sh / 2, sw, sh, 0, 0, SHADOW, SPRITE_UNTEXTURED, -1, 0)
    }
    for (const s of sprites) {
      writeSprite(
        layer,
        i++,
        s.dx - CELL_GUTTER + s.cell.cw / 2,
        s.dy - CELL_GUTTER + s.cell.ch / 2,
        s.cell.cw,
        s.cell.ch,
        s.cell.atlas,
        s.cell.frame,
        WHITE,
        0,
        s.sortKey,
        0,
      )
    }
    for (const a of acaciaCells) {
      writeSprite(
        layer,
        i++,
        a.x - CELL_GUTTER + a.cell.cw / 2,
        a.y - CELL_GUTTER + a.cell.ch / 2,
        a.cell.cw,
        a.cell.ch,
        a.cell.atlas,
        a.cell.frame,
        WHITE,
        0,
        a.key,
        0,
      )
    }
    layer.touch()
    this.buildDressing(sprites)
    this.stats.trees = sprites.length
    this.stats.acacias = acaciaCells.length
  }

  /** The season's specks on every tree that sways (cacti and dead trees have no crown to dress). */
  private buildDressing(sprites: TreeSprite[]): void {
    const layer = this.dressLayer
    const dressing = dressingFor(this.season)
    const crowns = dressing ? sprites.filter((s) => s.sways) : []
    if (!dressing) {
      layer.resize(0)
      layer.touch()
      return
    }
    layer.resize(crowns.length * dressing.count)
    let i = 0
    for (const s of crowns) {
      const seed = Math.round(s.cx) * 1009 + Math.round(s.cy)
      for (let k = 0; k < dressing.count; k++) {
        const sp = crownSpeck(dressing, seed, k, s.cx, s.cy, s.sz)
        writeSprite(layer, i++, sp.x, sp.y, sp.size, sp.size, 0, 0, sp.colour, SPRITE_UNTEXTURED, -1, 0)
      }
    }
    layer.touch()
  }

  /** The canopy of a tree without its trunk: the top 62% of the box, as the canvas sway clip. */
  private canopyCell(s: TreeSprite): CellRef | null {
    if (this.canopyEpoch !== this.atlas.epoch) {
      this.canopyCells.clear()
      this.canopyEpoch = this.atlas.epoch
    }
    const rows = Math.max(1, Math.min(s.h, Math.round(s.cy + s.sz * 0.62) - s.dy))
    const key = `K|${s.tile[0]},${s.tile[1]}|${s.w}x${s.h}|${rows}`
    let cell: CellRef | null | undefined = this.canopyCells.get(key)
    if (!cell) {
      cell = this.atlas.bake(key, s.w, rows, (ctx) => {
        if (s.crop) drawVegetationCrop(ctx, s.crop, 0, 0)
        else drawTile(ctx, ATLAS_TOWN, s.tile, 0, 0, s.w)
      })
      if (cell) this.canopyCells.set(key, cell)
    }
    return cell ?? null
  }

  /** Per-frame wind: canopy-only sprites, shifted whole pixels, for the visible trees. */
  update(f: CfFrame): boolean {
    const cast = this.updateCast(f.world)
    const sway = this.updateSway(f)
    return cast || sway
  }

  /**
   * The cast shadows: each tree's shadow stretched away from the sun. Rewritten only when the sun
   * has moved on (a few times per day) or the trees were rebuilt; none at night.
   */
  private updateCast(world: WorldState): boolean {
    const sun = castSun(world)
    const key = sun ? `${sun.key}|${this.sprites.length}|${this.atlas.epoch}` : 'night'
    if (key === this.castKey) return false
    this.castKey = key
    const cast = this.castLayer
    if (!sun) {
      if (cast.count === 0) return false
      cast.clear()
      cast.touch()
      return true
    }
    const sprites = this.sprites
    cast.resize(sprites.length)
    const color = rgba(20, 24, 18, Math.round(sun.alpha * 255))
    for (let i = 0; i < sprites.length; i++) {
      const s = sprites[i]
      const length = s.sz * sun.length
      const x0 = s.cx + s.sz * 0.5
      const y0 = s.cy + s.sz * 0.92
      const h = Math.max(1, Math.round(s.sz * 0.22))
      writeSprite(
        cast,
        i,
        x0 + (sun.dx * length) / 2,
        y0 + (sun.dy * length) / 2,
        length,
        h,
        0,
        0,
        color,
        SPRITE_UNTEXTURED,
        -1,
        0,
        Math.atan2(sun.dy, sun.dx),
      )
    }
    cast.touch()
    return true
  }

  private updateSway(f: CfFrame): boolean {
    const sway = this.swayLayer
    const { camera, world, win, now } = f
    const density = Math.min(LOW_PERF ? 1 : 2, Math.max(1, globalThis.devicePixelRatio || 1))
    const canvasWouldSway =
      f.detail !== 'overview' && !LOW_PERF && Math.ceil(camera.zoom * density * 8) / 8 >= 1
    if (!canvasWouldSway || this.sprites.length === 0) {
      if (sway.count === 0) return false
      sway.clear()
      return true
    }
    const windKey = `${win.c0},${win.c1},${win.r0},${win.r1}|${world.weather?.kind}|${(world as WorldState).weather?.wind_x}`
    if (now - this.lastSwayAt < SWAY_INTERVAL_MS && windKey === this.swayKey) return false
    this.lastSwayAt = now
    this.swayKey = windKey
    const t0 = performance.now()
    const view = {
      x0: win.c0 * TILE,
      y0: win.r0 * TILE,
      x1: win.c1 * TILE,
      y1: win.r1 * TILE,
    }
    const wind = { storm: world.weather?.kind === 'storm', windX: (world as WorldState).weather?.wind_x ?? 0 }
    const amp = wind.storm ? 2.4 : 1.2
    const lean = Math.max(-1, Math.min(1, wind.windX)) * (wind.storm ? 1 : 0.4)
    // Trees are sorted by bottom edge: visible ones lie between these two.
    const lo = lowerBound(this.bottoms, view.y0)
    const sprites = this.sprites
    let n = 0
    sway.reserve(Math.max(64, sprites.length))
    const epoch = this.atlas.epoch
    // The visible span is a handful of rows: count first so resize happens once.
    if (this.picked.length < sprites.length) {
      this.picked = new Int32Array(sprites.length)
      this.shifts = new Int8Array(sprites.length)
    }
    const picked = this.picked
    const shifts = this.shifts
    let count = 0
    for (let i = lo; i < sprites.length; i++) {
      const s = sprites[i]
      if (s.cy > view.y1) {
        if (s.sortKey - 32 > view.y1) break
        continue
      }
      if (s.cx + s.sz < view.x0 || s.cx > view.x1 || s.cy + s.sz < view.y0) continue
      if (!s.sways) continue
      const gust = 0.6 + 0.4 * Math.sin(now / 2300 + s.cx * 0.01)
      const shift = Math.round((Math.sin(now / 620 + s.phase) * amp + lean) * gust)
      if (shift === 0) continue
      picked[count] = i
      shifts[count++] = shift
    }
    sway.resize(count)
    for (let k = 0; k < count; k++) {
      const s = sprites[picked[k]]
      const cell = this.canopyCell(s)
      if (!cell) continue
      if (this.atlas.epoch !== epoch) break
      writeSprite(
        sway,
        n++,
        s.dx + shifts[k] - CELL_GUTTER + cell.cw / 2,
        s.dy - CELL_GUTTER + cell.ch / 2,
        cell.cw,
        cell.ch,
        cell.atlas,
        cell.frame,
        WHITE,
        0,
        s.sortKey,
        0,
      )
    }
    sway.resize(n)
    sway.touch()
    this.stats.sway = n
    this.stats.swayMs += performance.now() - t0
    return true
  }
}

function lowerBound(sorted: number[], value: number): number {
  let lo = 0
  let hi = sorted.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (sorted[mid] < value) lo = mid + 1
    else hi = mid
  }
  return lo
}
