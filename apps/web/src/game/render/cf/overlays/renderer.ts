import { SPRITE_UNTEXTURED, SpriteLayer } from 'cubeforge'
import { drawTradeNetwork2D } from '../../base-parts/trade-network'
import { atmosphereTints, composeTints, precipitating, writePrecipitation, type Tint } from './atmosphere'
import { packRgba } from './color'
import type { CfFrame } from './frame'
import { NO_FEATURES, type CfFeatures } from './features'
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
import { applyHeat, createTileLayers, TILE_OUTLINE, type TileLayerSet } from './tile-layers'

/** Draw order of what this renderer adds (the agreed layering: terrain 0, overlays 10, land use 15, effects 50, HUD 60). */
export const Z = {
  tint: 4,
  precip: 6,
  groundStatic: 11,
  ground: 12,
  roads: 15,
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
  readonly tileLayers: TileLayerSet
  private readonly heat: HeatGrid
  private readonly layers: SpriteLayer[] = []
  private readonly tintLayer: SpriteLayer
  private readonly precipLayer: SpriteLayer
  private readonly groundStatic: SpriteRecorder
  private readonly ground: SpriteRecorder
  private readonly roads: SpriteRecorder
  private readonly effects: SpriteRecorder
  private readonly hud: SpriteRecorder
  private readonly contestedScratch: Uint16Array
  private heatKey = ''
  private staticKey = ''
  private territoryRef: unknown = null
  private contestedKey = ''
  private outlineKey = ''
  features: CfFeatures = NO_FEATURES
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
    this.host.setScreenTint(null)
    this.shapes.dispose()
    this.glyphs.dispose()
  }

  /** Rewrite every enabled layer from this frame's world. */
  update(f: CfFrame): UpdateResult {
    const feat = this.features
    const times = ZERO_TIMES()
    const t0 = performance.now()
    let mark = t0
    const lap = (k: keyof SectionTimes) => {
      const now = performance.now()
      times[k] += now - mark
      mark = now
    }

    if (feat.atmosphere) this.updateAtmosphere(f)
    lap('atmosphere')

    const heatRebuilt = feat.overlays ? this.updateHeat(f) : false
    lap('heat')

    // Per-frame ground effects: clouds, lines, water and fire light.
    const gv = { zoom: f.zoom, dpr: f.dpr }
    const anyGround = feat.overlays || feat.water || feat.glow || feat.atmosphere
    if (anyGround) {
      this.ground.begin(gv)
      const ctx = this.ground.asContext()
      if (feat.overlays) {
        paintClouds(ctx, f)
        paintLines(ctx, f)
      }
      if (feat.atmosphere) paintWaterStars(ctx, f)
      if (feat.water) paintWaterShimmer(ctx, f)
      if (feat.glow) paintFireGlow(ctx, f)
      this.ground.end()
    }
    if (feat.overlays) this.updateTerritoryBorders(f)
    lap('ground')

    if (feat.roads) {
      this.roads.begin(gv)
      drawTradeNetwork2D(this.roads.asContext(), f.world, f.bounds, f.t, 'roads')
      this.roads.end()
    }
    lap('roads')

    if (feat.effects) {
      this.effects.begin(gv)
      paintEffects(this.effects.asContext(), f)
      this.effects.end()
    }
    lap('effects')

    if (feat.hud) {
      this.hud.begin(gv)
      paintHud(this.hud.asContext(), f, { grid: f.viewFlags.grid })
      this.hud.end()
    }
    lap('hud')

    times.total = performance.now() - t0
    const unsupported: Record<string, number> = {}
    for (const r of [this.ground, this.roads, this.effects, this.hud, this.groundStatic]) {
      for (const [k, v] of Object.entries(r.stats.unsupported)) unsupported[k] = (unsupported[k] ?? 0) + v
    }
    this.lastResult = { times, sprites: this.spriteCount, heatRebuilt, unsupported }
    this.host.markDirty()
    return this.lastResult
  }

  // ── atmosphere ─────────────────────────────────────────────────────────────

  private updateAtmosphere(f: CfFrame): void {
    const { world, t, W, H } = f
    const tints = atmosphereTints(world, t)
    if (this.features.tint === 'screen') {
      this.host.setScreenTint(composeTints(tints))
      this.tintLayer.clear()
    } else {
      this.host.setScreenTint(null)
      this.tintLayer.clear()
      for (const tint of tints) this.addTint(tint, W, H)
      this.tintLayer.touch()
    }
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
      this.heat.compute(world, settings, f.organisms)
      applyHeat(this.tileLayers, this.heat)
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
