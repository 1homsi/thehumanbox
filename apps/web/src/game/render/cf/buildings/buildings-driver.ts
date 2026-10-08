import type { SpriteLayer } from 'cubeforge'
import type { Building } from '../../../../shared/types'
import { TILE } from '../../../model/palette'
import { PAD, PAD_TOP } from '../../building-painters/kit'
import { drawBuilding } from '../../building-draw/draw'
import { resolveBuildingFootprint } from '../../building-draw/footprints'
import { lineageEraTiers } from '../../draw-helpers'
import { terrainSeason } from '../../terrain-season'
import { vegetationSeason } from '../../landscape-style'
import type { CellAtlas, CellRef } from '../atlas/cell-atlas'
import { CELL_GUTTER } from '../atlas/cell-atlas'
import { WHITE, writeSprite, type CfDriver, type CfFrame } from '../frame'
import {
  buildingSortKey,
  contentOrigin,
  describeBuilding,
  nightBucketOf,
  type BuildingFrameInfo,
  type BuildingVisual,
} from './building-visuals'

/** Cell size classes (gutter included) for 1..8 tile footprints: PAD*2 wide, PAD_TOP+PAD_BOT tall. */
export const BUILDING_CLASSES: ReadonlyArray<readonly [number, number]> = [
  [34, 48],
  [50, 56],
  [66, 48],
  [50, 72],
  [66, 72],
  [66, 80],
  [82, 96],
]

/** Tiles beyond the view that still get sprites (the tallest footprint reaches 8). */
export const BUILDING_MARGIN = 6

export function bakeBuilding(atlas: CellAtlas, v: BuildingVisual) {
  return atlas.bake(v.key, v.contentW, v.contentH, (ctx) => {
    ctx.translate(PAD, PAD_TOP)
    // ox/oy = the building's own tile, so its tile origin lands on the translate.
    drawBuilding(ctx, v.record, v.record.x, v.record.y, TILE, v.night, v.detail)
  })
}

/**
 * Writes every building near the view into a depth-sorted SpriteLayer. Each
 * distinct look (kind, footprint, variant, tier, night, condition, site stage...)
 * is painted once with the existing canvas painters into the atlas; the per-frame
 * work is only a key lookup and a handful of typed-array writes per building.
 */
export class BuildingsDriver implements CfDriver {
  /** Visible buildings at the last update, sprite index aligned. */
  ids: number[] = []
  stats = { sprites: 0, bakes: 0, resets: 0, updates: 0, skipped: 0, ms: 0 }
  private visible: Building[] = []
  private cells: CellRef[] = []
  private sig = ''
  private tiersFor: unknown = null
  private tiers = new Map<string, number>()

  private readonly layer: SpriteLayer
  private readonly atlas: CellAtlas
  /** An invisible layer of footprint rectangles: pick() on the drawn layer would test the padded cells. */
  private readonly hits: SpriteLayer

  constructor(layer: SpriteLayer, atlas: CellAtlas, hits: SpriteLayer) {
    this.layer = layer
    this.atlas = atlas
    this.hits = hits
  }

  /** The id of the building whose footprint covers a world point (topmost first), or -1. */
  pick(wx: number, wy: number): number {
    return this.hits.pick(wx, wy)
  }

  update(f: CfFrame): boolean {
    const { world, win } = f
    const buildings = world.buildings
    if (!buildings || buildings.length === 0) {
      if (this.layer.count === 0) return false
      this.layer.clear()
      this.sig = ''
      return true
    }
    if (this.tiersFor !== world.lineage_eras) {
      this.tiersFor = world.lineage_eras
      this.tiers = lineageEraTiers(world.lineage_eras)
    }
    const info: BuildingFrameInfo = {
      tick: world.tick,
      nightBucket: nightBucketOf(world),
      detail: f.detail,
      tiers: this.tiers,
      winter: vegetationSeason(terrainSeason(world)) === 'winter',
    }
    const sig = `${world.frame_id}|${buildings.length}|${world.tick}|${info.nightBucket}|${info.detail}|${info.winter ? 1 : 0}|${win.c0},${win.c1},${win.r0},${win.r1}|${this.atlas.epoch}`
    if (sig === this.sig && this.ids.length === this.layer.count) {
      this.stats.skipped++
      return false
    }
    const t0 = performance.now()
    const { c0, c1, r0, r1 } = win
    const ox = f.ox
    const oy = f.oy
    const layer = this.layer
    const vis = this.visible
    const cells = this.cells
    // A full page is cleared while baking, which orphans cells fetched earlier in
    // the same pass: collect again once, now that the new cells exist.
    for (let pass = 0; pass < 2; pass++) {
      const epoch = this.atlas.epoch
      vis.length = 0
      cells.length = 0
      for (const b of buildings) {
        if (typeof b.x !== 'number' || typeof b.y !== 'number') continue
        const lx = b.x - ox
        const ly = b.y - oy
        if (lx < c0 - BUILDING_MARGIN || lx > c1 + BUILDING_MARGIN) continue
        if (ly < r0 - BUILDING_MARGIN || ly > r1 + BUILDING_MARGIN) continue
        const v = describeBuilding(b, info)
        const cell = this.atlas.get(v.key) ?? bakeBuilding(this.atlas, v)
        if (!cell) continue
        vis.push(b)
        cells.push(cell)
      }
      if (epoch === this.atlas.epoch) break
    }
    this.sig = sig.slice(0, sig.lastIndexOf('|') + 1) + this.atlas.epoch
    const n = vis.length
    layer.resize(n)
    for (let i = 0; i < n; i++) {
      const b = vis[i]
      const cell = cells[i]
      const o = contentOrigin(b, ox, oy)
      writeSprite(
        layer,
        i,
        o.x - CELL_GUTTER + cell.cw / 2,
        o.y - CELL_GUTTER + cell.ch / 2,
        cell.cw,
        cell.ch,
        cell.atlas,
        cell.frame,
        WHITE,
        0,
        buildingSortKey(b),
        b.id,
      )
    }
    // Footprint rectangles for picking, anchored at their top-left corner.
    const hits = this.hits
    hits.resize(n)
    for (let i = 0; i < n; i++) {
      const b = vis[i]
      const [fw, fh] = resolveBuildingFootprint(b)
      writeSprite(
        hits,
        i,
        Math.round((b.x - ox) * TILE),
        Math.round((b.y - oy) * TILE),
        fw * TILE,
        fh * TILE,
        0,
        0,
        WHITE,
        0,
        buildingSortKey(b),
        b.id,
      )
    }
    hits.touch()
    this.ids.length = n
    for (let i = 0; i < n; i++) this.ids[i] = vis[i].id
    layer.touch()
    this.stats.sprites = n
    this.stats.bakes = this.atlas.bakes
    this.stats.resets = this.atlas.resets
    this.stats.updates++
    this.stats.ms += performance.now() - t0
    return true
  }
}
