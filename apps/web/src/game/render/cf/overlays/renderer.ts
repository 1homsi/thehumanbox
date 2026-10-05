import { SPRITE_UNTEXTURED, SpriteLayer } from 'cubeforge'
import { TILE } from '../../../model/palette'
import { drawTradeNetwork2D } from '../../base-parts/trade-network'
import { drawRail, drawTrain, trainProgress } from '../../era-traffic'
import { lineageEraTiers } from '../../draw-helpers'
import { cachedRailLinks } from '../../rails'
import { paintPeopleLabels, type PeopleLabelSource } from '../people/people-labels'
import { atmosphereTints, precipitating, writePrecipitation, type Tint } from './atmosphere'
import { atlasId, makeCanvas } from './atlas-host'
import { packRgba } from './color'
import type { CfFrame } from './frame'
import { GlyphSet } from './glyph-atlas'
import { HeatGrid, type HeatSettings } from './heatmap'
import type { RenderHost } from './host'
import { paintEffects } from './paint-effects'
import {
  paintClouds,
  paintFireGlow,
  paintLines,
  paintTerritoryBorders,
  paintWaterShimmer,
  paintWaterStars,
} from './paint-ground'
import { paintHud } from './paint-hud'
import { SpriteRecorder } from './recorder'
import { ShapeAtlas } from './shape-atlas'
import { createTileLayers, TILE_OUTLINE, type TileLayerSet } from './tile-layers'

/**
 * Draw order of what this renderer adds. The rest of the map: ground detail 2.5 to 5.6, then
 * these, land use 15, huts and buildings 18 to 20, animals 29 to 31, people 39 to 41.5.
 * The tint sits above the ground (terrain, shore, trees, mountains) and under everything built
 * or alive, as the canvas painter laid it.
 */
export const Z = {
  tint: 5,
  precip: 6,
  heat: 10,
  groundStatic: 11,
  ground: 12,
  roads: 15,
  traffic: 25,
  labels: 45,
  effects: 50,
  hud: 60,
} as const

export interface SectionTimes {
  atmosphere: number
  heat: number
  ground: number
  roads: number
  effects: number
  hud: number
  total: number
}

export interface UpdateResult {
  times: SectionTimes
  sprites: number
  heatRebuilt: boolean
  unsupported: Record<string, number>
}

/** What the renderer needs besides the world: the people layer, for names and work poses. */
export interface OverlayExtras {
  people: PeopleLabelSource | null
  selectedId: string | null
}

const ZERO_TIMES = (): SectionTimes => ({
  atmosphere: 0,
  heat: 0,
  ground: 0,
  roads: 0,
  effects: 0,
  hud: 0,
  total: 0,
})

/**
 * The non-sprite world visuals on cubeforge: owns the SpriteLayers, TileLayers, atlases and
 * recorders, and `update()` rewrites them from a frame of world data. No React and no GPU of its
 * own: it talks to the engine through a `RenderHost`.
 */
export class CfOverlayRenderer {
  readonly shapes: ShapeAtlas
  readonly glyphs: GlyphSet
  /** Contested borders and structure outlines (the heat map itself is one sprite). */
  readonly tileLayers: TileLayerSet
  private readonly heat: HeatGrid
  private readonly heatCanvas: HTMLCanvasElement
  private readonly heatId = atlasId('heat')
  private readonly heatLayer: SpriteLayer
  private heatShown = false
  private readonly layers: SpriteLayer[] = []
  private readonly tintLayer: SpriteLayer
  private readonly precipLayer: SpriteLayer
  private readonly groundStatic: SpriteRecorder
  private readonly ground: SpriteRecorder
  private readonly roads: SpriteRecorder
  private readonly traffic: SpriteRecorder
  private readonly labels: SpriteRecorder
  private readonly effects: SpriteRecorder
  private readonly hud: SpriteRecorder
  private readonly contestedScratch: Uint16Array
  private heatKey = ''
  private staticKey = ''
  private territoryRef: unknown = null
  private contestedKey = ''
  private outlineKey = ''
  lastResult: UpdateResult = { times: ZERO_TIMES(), sprites: 0, heatRebuilt: false, unsupported: {} }

  private readonly host: RenderHost
  readonly gridWidth: number
  readonly gridHeight: number

  constructor(host: RenderHost, gridWidth: number, gridHeight: number) {
    this.host = host
    this.gridWidth = gridWidth
    this.gridHeight = gridHeight
    this.shapes = new ShapeAtlas(host)
    this.glyphs = new GlyphSet(host)
    this.tileLayers = createTileLayers(gridWidth, gridHeight)
    this.heat = new HeatGrid(gridWidth, gridHeight)
    this.contestedScratch = new Uint16Array(gridWidth * gridHeight)
    const shape = (z: number) =>
      this.addLayer(
        new SpriteLayer({
          atlases: [this.shapes.layerAtlas()],
          zIndex: z,
          sampling: 'linear',
          capacity: 512,
        }),
      )
    const text = (z: number) =>
      this.addLayer(
        new SpriteLayer({
          atlases: this.glyphs.layerAtlases(),
          zIndex: z + 0.5,
          sampling: 'linear',
          capacity: 256,
        }),
      )
    // The heat map is a 1 px per tile canvas stretched over the world, nearest-sampled: crisp tile
    // squares, and (unlike a TileLayer) drawn above the trees and below the buildings.
    this.heatCanvas = makeCanvas(gridWidth, gridHeight)
    host.register(this.heatId, this.heatCanvas)
    this.heatLayer = this.addLayer(
      new SpriteLayer({
        atlases: [
          { dynamicSrc: this.heatId, frameWidth: gridWidth, frameHeight: gridHeight, frameColumns: 1 },
        ],
        zIndex: Z.heat,
        sampling: 'nearest',
        capacity: 1,
        visible: false,
      }),
    )
    this.heatLayer.add(
      (gridWidth * TILE) / 2,
      (gridHeight * TILE) / 2,
      gridWidth * TILE,
      gridHeight * TILE,
      0,
    )
    this.tintLayer = shape(Z.tint)
    this.precipLayer = shape(Z.precip)
    this.groundStatic = new SpriteRecorder(
      shape(Z.groundStatic),
      text(Z.groundStatic),
      this.shapes,
      this.glyphs,
    )
    this.ground = new SpriteRecorder(shape(Z.ground), text(Z.ground), this.shapes, this.glyphs)
    this.roads = new SpriteRecorder(shape(Z.roads), text(Z.roads), this.shapes, this.glyphs)
    this.traffic = new SpriteRecorder(shape(Z.traffic), text(Z.traffic), this.shapes, this.glyphs)
    this.labels = new SpriteRecorder(shape(Z.labels), text(Z.labels), this.shapes, this.glyphs)
    this.effects = new SpriteRecorder(shape(Z.effects), text(Z.effects), this.shapes, this.glyphs)
    this.hud = new SpriteRecorder(shape(Z.hud), text(Z.hud), this.shapes, this.glyphs)
  }

  private addLayer(layer: SpriteLayer): SpriteLayer {
    this.layers.push(layer)
    this.host.addLayer(layer)
    return layer
  }

  /** Sprites currently submitted to the engine across every layer this renderer owns. */
  get spriteCount(): number {
    let n = 0
    for (const l of this.layers) n += l.count
    return n
  }

  dispose(): void {
    for (const l of this.layers) this.host.removeLayer(l)
    this.host.unregister(this.heatId)
    this.shapes.dispose()
    this.glyphs.dispose()
  }

  /** Rewrite every layer from this frame's world. */
  update(f: CfFrame, extras: OverlayExtras = { people: null, selectedId: null }): UpdateResult {
    const times = ZERO_TIMES()
    const t0 = performance.now()
    let mark = t0
    const lap = (k: keyof SectionTimes) => {
      const now = performance.now()
      times[k] += now - mark
      mark = now
    }

    this.updateAtmosphere(f)
    lap('atmosphere')

    const heatRebuilt = this.updateHeat(f)
    lap('heat')

    // Per-frame ground effects: clouds, lines, water and fire light.
    const gv = { zoom: f.zoom, dpr: f.dpr }
    this.ground.begin(gv)
    const ground = this.ground.asContext()
    paintClouds(ground, f)
    paintLines(ground, f)
    paintWaterStars(ground, f)
    paintWaterShimmer(ground, f)
    paintFireGlow(ground, f)
    this.ground.end()
    this.updateTerritoryBorders(f)
    lap('ground')

    // Trade roads and the rails and trains that run along them.
    this.roads.begin(gv)
    drawTradeNetwork2D(this.roads.asContext(), f.world, f.bounds, f.t, 'roads')
    this.paintRails(this.roads.asContext(), f)
    this.roads.end()
    this.traffic.begin(gv)
    drawTradeNetwork2D(this.traffic.asContext(), f.world, f.bounds, f.t, 'caravans')
    this.traffic.end()
    lap('roads')

    this.effects.begin(gv)
    paintEffects(this.effects.asContext(), f)
    this.effects.end()
    lap('effects')

    this.hud.begin(gv)
    const { labels: settlementLabels } = paintHud(this.hud.asContext(), f, { grid: f.viewFlags.grid })
    this.hud.end()

    // Names, thoughts, work poses and prayer glyphs go above the people; town names claim space first.
    this.labels.begin(gv)
    if (extras.people) {
      paintPeopleLabels(this.labels.asContext(), {
        people: extras.people,
        selectedId: extras.selectedId,
        focus: f.focus,
        viewFlags: f.viewFlags,
        zoom: f.zoom,
        now: f.t,
        prayers: f.world.prayers,
        vehicles: f.world.vehicles,
        settlementLabels,
        window: f.bounds,
        ox: f.ox,
        oy: f.oy,
      })
    }
    this.labels.end()
    lap('hud')

    times.total = performance.now() - t0
    const unsupported: Record<string, number> = {}
    for (const r of [
      this.ground,
      this.roads,
      this.traffic,
      this.labels,
      this.effects,
      this.hud,
      this.groundStatic,
    ]) {
      for (const [k, v] of Object.entries(r.stats.unsupported)) unsupported[k] = (unsupported[k] ?? 0) + v
    }
    this.lastResult = { times, sprites: this.spriteCount, heatRebuilt, unsupported }
    this.host.markDirty()
    return this.lastResult
  }

  // ── rails ──────────────────────────────────────────────────────────────────

  /** Railways between each tribe's train stations, with trains shuttling along them in the tribe's age. */
  private paintRails(ctx: CanvasRenderingContext2D, f: CfFrame): void {
    const { world, ox, oy, t } = f
    const links = cachedRailLinks(world.buildings)
    if (links.length === 0) return
    const tiers = lineageEraTiers(world.lineage_eras)
    for (const link of links) {
      drawRail(
        ctx,
        (link.a.x - ox) * TILE,
        (link.a.y - oy) * TILE,
        (link.b.x - ox) * TILE,
        (link.b.y - oy) * TILE,
      )
    }
    for (const link of links) {
      drawTrain(
        ctx,
        (link.a.x - ox) * TILE,
        (link.a.y - oy) * TILE,
        (link.b.x - ox) * TILE,
        (link.b.y - oy) * TILE,
        trainProgress(link, world.tick),
        tiers.get(link.owner) ?? 5,
        t,
      )
    }
  }

  // ── atmosphere ─────────────────────────────────────────────────────────────

  /**
   * Season, weather and day/night as translucent quads over the whole map, between the ground and
   * everything built or alive (so a night darkens the land but not the people on it), plus rain
   * and snow.
   */
  private updateAtmosphere(f: CfFrame): void {
    const { world, t, W, H } = f
    const tints = atmosphereTints(world, t)
    this.tintLayer.clear()
    for (const tint of tints) this.addTint(tint, W, H)
    this.tintLayer.touch()
    if (precipitating(world)) writePrecipitation(this.precipLayer, this.shapes.softLine(), world, t, W, H)
    else if (this.precipLayer.count > 0) {
      this.precipLayer.clear()
      this.precipLayer.touch()
    }
  }

  private addTint(tint: Tint, W: number, H: number): void {
    if (tint.a <= 0) return
    const layer = this.tintLayer
    const i = layer.add(W / 2, H / 2, W, H)
    layer.color[i] = packRgba(tint.r, tint.g, tint.b, tint.a)
    layer.flags[i] = SPRITE_UNTEXTURED
  }

  // ── heat map ───────────────────────────────────────────────────────────────

  private updateHeat(f: CfFrame): boolean {
    const { world, viewFlags } = f
    const settings: HeatSettings = { overlay: f.overlay, viewFlags, focus: f.focus }
    const g = world.grid
    // Everything the heat map reads changes only with a new frame of data or a setting.
    const key = [
      world.frame_id,
      f.overlay ?? '',
      f.focus,
      viewFlags.territory ? 1 : 0,
      viewFlags.fertility ? 1 : 0,
      viewFlags.hazard ? 1 : 0,
      viewFlags.trails ? 1 : 0,
      g.width,
      g.height,
    ].join('|')
    let rebuilt = false
    if (key !== this.heatKey) {
      this.heatKey = key
      const shown = this.heat.compute(world, settings, f.organisms)
      this.heatShown = shown > 0
      this.heatLayer.visible = this.heatShown
      if (this.heatShown) {
        const ctx = this.heatCanvas.getContext('2d')
        if (ctx) {
          const image = new ImageData(new Uint8ClampedArray(this.heat.rgba), g.width, g.height)
          ctx.putImageData(image, 0, 0)
          this.host.dirty(this.heatId, 0, 0, g.width, g.height)
        }
      }
      rebuilt = true
    }
    // Contested border: tiles change with the data, the pulse is just the layer's opacity.
    const contested = this.tileLayers.contested
    if (viewFlags.territory && world.territory && world.territory.contested.length > 0) {
      if (this.contestedKey !== key) {
        this.contestedKey = key
        this.heat.contestedTiles(world, f.ox, f.oy, this.contestedScratch)
        contested.setTiles(this.contestedScratch)
        this.tileLayers.uploads.contested++
      }
      contested.opacity = 0.12 + Math.abs(Math.sin(f.t / 420)) * 0.16
    } else if (contested.opacity !== 0) {
      contested.opacity = 0
    }
    // Structure outlines.
    const outline = this.tileLayers.outline
    if (f.viewFlags.structures && g.structure) {
      if (this.outlineKey !== key) {
        this.outlineKey = key
        const ids = this.contestedScratch
        ids.fill(0)
        const { width, height } = this.heat
        for (let row = 0; row < height; row++) {
          const r = g.structure[row]
          if (!r) continue
          for (let col = 0; col < width; col++)
            if (r[col] && r[col] > 0.1) ids[row * width + col] = TILE_OUTLINE
        }
        outline.setTiles(ids)
        this.tileLayers.uploads.outline++
      }
      outline.opacity = 1
    } else if (outline.opacity !== 0) {
      outline.opacity = 0
    }
    return rebuilt
  }

  private updateTerritoryBorders(f: CfFrame): void {
    const { world, viewFlags } = f
    const key = `${viewFlags.territory ? 1 : 0}|${f.focus}`
    if (key === this.staticKey && world.territory === this.territoryRef) return
    this.staticKey = key
    this.territoryRef = world.territory
    this.groundStatic.begin({ zoom: f.zoom, dpr: f.dpr })
    if (viewFlags.territory) paintTerritoryBorders(this.groundStatic.asContext(), world, f.focus)
    this.groundStatic.end()
  }
}
