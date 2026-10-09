import { SPRITE_UNTEXTURED, SpriteLayer, TextLayer } from 'cubeforge'
import { TILE } from '../../../model/palette'
import { drawTradeNetwork2D } from '../../base-parts/trade-network'
import { drawRail, drawTrain, trainProgress } from '../../era-traffic'
import { lineageEraTiers } from '../../draw-helpers'
import { cachedRailLinks } from '../../rails'
import { paintPeopleLabels, type PeopleLabelSource } from '../people/people-labels'
import { PeopleNameLayer } from '../people/people-names'
import { atmosphereTints, precipitating, writePrecipitation, type Tint } from './atmosphere'
import { atlasId, makeCanvas } from './atlas-host'
import { packRgba } from './color'
import type { CfFrame } from './frame'
import { GlyphSet } from './glyph-atlas'
import { HeatGrid, type HeatSettings } from './heatmap'
import type { RenderHost } from './host'
import { paintCarcasses } from './paint-carcasses'
import { paintEffects } from './paint-effects'
import { paintPower } from './paint-power'
import { paintEraFlourish } from './paint-era-flourish'
import { EraWatch } from '../../../model/era-flourish'
import { paintArtworks } from './paint-artworks'
import {
  paintClouds,
  paintFireGlow,
  paintLines,
  paintTerritoryBorders,
  paintWaterShimmer,
  paintWaterStars,
} from './paint-ground'
import { hazeLevels, paintHaze } from './haze'
import { paintChimneySmoke } from './chimney-smoke'
import { paintDew, dewLevel } from './dew'
import { paintFallingBlossoms } from './falling-blossoms'
import { paintFallingLeaves } from './falling-leaves'
import { paintCampfireSparks, paintEmbers } from './embers'
import { paintEruption } from './eruption'
import { paintGroundSnow } from './ground-snow'
import { paintFloodFront } from './flood-front'
import { paintSkyFlyers } from './sky-flyers'
import { paintFairCloudsFrame } from './fair-clouds'
import { paintGroundIce } from './ground-ice'
import { paintPlagueHaze } from './plague-haze'
import { ANIMAL_DUST, FootstepDust } from './footstep-dust'
import { paintWaterRipples } from './water-ripples'
import { zoomDetailLevel } from '../../character-visuals'
import { paintTornado, tornadoAt } from './tornado'
import { vegetationSeason } from '../../landscape-style'
import { terrainSeason } from '../../terrain-season'
import { paintHud } from './paint-hud'
import { paintFireflies } from './fireflies'
import { moonLight, nightLevel, paintMoon, paintStars } from './night-sky'
import { paintSun, sunSide, sunStrength } from './sun-glow'
import { SpriteRecorder } from './recorder'
import { ShapeAtlas } from './shape-atlas'
import {
  lightningFlash,
  newWeatherFxState,
  observeWeather,
  paintBolt,
  paintPuddles,
  paintRainbow,
  paintSplashes,
  rainbowStrength,
  strikeAt,
  wetnessOf,
  type StrikeView,
  type WeatherFxState,
} from './weather-fx'

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
  smoke: 25.5,
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

/** The ground effects are rewritten at most this often when nothing else changed. */
const GROUND_INTERVAL_MS = 66

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
 * The non-sprite world visuals on cubeforge: owns the SpriteLayers, atlases and
 * recorders, and `update()` rewrites them from a frame of world data. No React and no GPU of its
 * own: it talks to the engine through a `RenderHost`.
 */
export class CfOverlayRenderer {
  readonly shapes: ShapeAtlas
  readonly glyphs: GlyphSet
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
  private readonly smoke: SpriteRecorder
  private readonly labels: SpriteRecorder
  /** Names and thoughts: text runs above the people (see `PeopleNameLayer`). */
  private readonly names: PeopleNameLayer
  private readonly effects: SpriteRecorder
  private readonly hud: SpriteRecorder
  private readonly contestedScratch: Uint16Array
  private contestedTiles: number[] = []
  private heatKey = ''
  private staticKey = ''
  private outlineFrame = -1
  private territoryRef: unknown = null
  private contestedKey = ''
  private groundKey = ''
  private groundFlags: unknown = null
  private groundAt = -Infinity
  private readonly weatherFx: WeatherFxState = newWeatherFxState()
  /** Tribes that entered a new era, marked on the map for a while. */
  private readonly eraWatch = new EraWatch()
  private readonly dust = new FootstepDust()
  private readonly animalDust = new FootstepDust(ANIMAL_DUST)
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
    this.smoke = new SpriteRecorder(shape(Z.smoke), text(Z.smoke), this.shapes, this.glyphs)
    this.labels = new SpriteRecorder(shape(Z.labels), text(Z.labels), this.shapes, this.glyphs)
    // Just above the label glyphs (zIndex + 0.5), so the names sit over the poses and prayer marks.
    const names = new TextLayer({ zIndex: Z.labels + 0.6 })
    this.host.addTextLayer(names)
    this.names = new PeopleNameLayer(names)
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
    this.host.removeTextLayer(this.names.layer)
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

    // Ground effects: clouds, lines, water glints and fire light. They drift slowly, so they are
    // rewritten about 15 times a second, at once when the view or the settings change.
    const gv = { zoom: f.zoom, dpr: f.dpr }
    const { c0, c1, r0, r1 } = f.bounds
    const groundKey = `${c0},${c1},${r0},${r1}|${f.zoom}|${f.world.frame_id}`
    if (
      groundKey !== this.groundKey ||
      f.viewFlags !== this.groundFlags ||
      f.t - this.groundAt >= GROUND_INTERVAL_MS
    ) {
      this.groundKey = groundKey
      this.groundFlags = f.viewFlags
      this.groundAt = f.t
      this.ground.begin(gv)
      const ground = this.ground.asContext()
      paintFairCloudsFrame(ground, f)
      paintClouds(ground, f)
      paintLines(ground, f)
      paintWaterStars(ground, f)
      paintWaterShimmer(ground, f)
      paintPlagueHaze(ground, f.organisms, f.bounds, f.ox, f.oy, f.t)
      const vents = { ...f.bounds, ox: f.ox, oy: f.oy }
      paintEruption(ground, f.world.grid.tiles, f.world.grid.biomes, vents, f.t, !f.world.is_day)
      const snowView = { ...f.bounds, ox: f.ox, oy: f.oy }
      paintGroundSnow(ground, f.world.grid.tiles, snowView, terrainSeason(f.world), f.world.season_progress)
      paintGroundIce(ground, f.world.grid.tiles, snowView, terrainSeason(f.world), f.world.season_progress)
      const floodView = { ...f.bounds, ox: f.ox, oy: f.oy }
      paintFloodFront(ground, f.world.grid.tiles, floodView, f.t)
      if (zoomDetailLevel(f.zoom) !== 'overview') {
        paintWaterRipples(ground, f.world.grid.tiles, { ...f.bounds, ox: f.ox, oy: f.oy }, f.t)
      }
      paintFireGlow(ground, f)
      const emberView = { ...f.bounds, ox: f.ox, oy: f.oy }
      paintEmbers(ground, f.world.grid.fire_intensity, emberView, f.t)
      paintCampfireSparks(ground, f.world.grid.tiles, emberView, f.t)
      paintPuddles(ground, f, wetnessOf(f.world))
      paintHaze(ground, f, hazeLevels(f.world), f.t)
      paintStars(ground, f.bounds, f.ox, f.oy, f.t, nightLevel(f.world))
      const { c0, c1, r0, r1 } = f.bounds
      const win = { x0: c0, y0: r0, x1: c1, y1: r1 }
      this.dust.observe(f.organisms, f.t, win)
      this.dust.paint(ground, f.ox, f.oy, f.t)
      const animals = f.world.viewport_animals ?? f.world.animals ?? []
      this.animalDust.observe(
        animals.map((a) => ({ id: String(a.id), x: a.x, y: a.y })),
        f.t,
        win,
      )
      this.animalDust.paint(ground, f.ox, f.oy, f.t)
      if (vegetationSeason(terrainSeason(f.world)) === 'autumn') {
        const { c0, c1, r0, r1 } = f.bounds
        paintFallingLeaves(
          ground,
          { x0: (c0 - f.ox) * TILE, y0: (r0 - f.oy) * TILE, x1: (c1 - f.ox) * TILE, y1: (r1 - f.oy) * TILE },
          f.t,
          1,
        )
      }
      if (vegetationSeason(terrainSeason(f.world)) === 'spring') {
        const { c0, c1, r0, r1 } = f.bounds
        paintFallingBlossoms(
          ground,
          { x0: (c0 - f.ox) * TILE, y0: (r0 - f.oy) * TILE, x1: (c1 - f.ox) * TILE, y1: (r1 - f.oy) * TILE },
          f.t,
          1,
        )
      }
      const dew = dewLevel(f.world)
      if (dew > 0 && vegetationSeason(terrainSeason(f.world)) !== 'winter') {
        paintDew(ground, f.bounds, f.ox, f.oy, f.t, dew, f.world.grid.tiles)
      }
      const night = nightLevel(f.world)
      if (night > 0 && vegetationSeason(terrainSeason(f.world)) === 'summer') {
        paintFireflies(ground, f.bounds, f.ox, f.oy, f.t, night, f.world.grid.tiles)
      }
      this.paintContested(ground, f)
      this.ground.end()
    }
    this.updateTerritoryBorders(f)
    lap('ground')

    // Trade roads and the rails and trains that run along them.
    const showTrade = f.viewFlags.tradeRoutes
    this.roads.begin(gv)
    if (showTrade) {
      drawTradeNetwork2D(this.roads.asContext(), f.world, f.bounds, f.t, 'roads')
      this.paintRails(this.roads.asContext(), f)
    }
    // Artworks lie on the ground where their makers stood: under the buildings and the people.
    paintArtworks(this.roads.asContext(), f)
    // Remains of prey lie on the ground too, under the buildings and the people.
    paintCarcasses(this.roads.asContext(), f)
    this.roads.end()
    this.traffic.begin(gv)
    if (showTrade) drawTradeNetwork2D(this.traffic.asContext(), f.world, f.bounds, f.t, 'caravans')
    this.traffic.end()
    this.smoke.begin(gv)
    paintChimneySmoke(this.smoke.asContext(), f.bounds, f.ox, f.oy, f.world.buildings, f.t)
    this.smoke.end()
    lap('roads')

    this.effects.begin(gv)
    paintEffects(this.effects.asContext(), f)
    paintPower(this.effects.asContext(), f)
    this.eraWatch.update(f.world)
    paintEraFlourish(this.effects.asContext(), f, this.eraWatch.active(f.world.tick))
    this.paintWeather(this.effects.asContext(), f)
    paintSkyFlyers(this.effects.asContext(), f)
    this.effects.end()
    lap('effects')

    this.hud.begin(gv)
    this.paintMoonInView(this.hud.asContext(), f)
    this.paintSunInView(this.hud.asContext(), f)
    const { labels: settlementLabels } = paintHud(this.hud.asContext(), f, { grid: f.viewFlags.grid })
    this.hud.end()

    // Names, thoughts, work poses and prayer glyphs go above the people; town names claim space first.
    this.labels.begin(gv)
    this.names.begin()
    if (extras.people) {
      paintPeopleLabels(this.labels.asContext(), {
        names: this.names,
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
        poses: this.labels,
      })
    }
    this.names.end()
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
    const flash = lightningFlash(world, t, this.viewOf(f))
    if (flash > 0) this.addTint({ r: 226, g: 236, b: 255, a: 0.34 * flash }, W, H)
    this.tintLayer.touch()
    if (precipitating(world)) writePrecipitation(this.precipLayer, this.shapes.softLine(), world, t, W, H)
    else if (this.precipLayer.count > 0) {
      this.precipLayer.clear()
      this.precipLayer.touch()
    }
  }

  /** The moon in the top-right corner of the view at night, at the phase the calendar gives. */
  private paintMoonInView(ctx: CanvasRenderingContext2D, f: CfFrame): void {
    const cosmos = f.world.cosmos
    if (!cosmos || nightLevel(f.world) <= 0) return
    const view = this.viewOf(f)
    const zoom = Math.max(0.01, f.zoom)
    paintMoon(
      ctx,
      view.cx + view.hw - 56 / zoom,
      view.cy - view.hh + 56 / zoom,
      14 / zoom,
      moonLight(cosmos.moon_phase, cosmos.moon_illum),
    )
  }

  /** The sun low in the east (left) corner at dawn and the west (right) corner at dusk. */
  private paintSunInView(ctx: CanvasRenderingContext2D, f: CfFrame): void {
    const strength = sunStrength(f.world)
    if (strength <= 0) return
    const view = this.viewOf(f)
    const zoom = Math.max(0.01, f.zoom)
    const side = sunSide(f.world.day_progress)
    paintSun(
      ctx,
      view.cx + side * (view.hw - 56 / zoom),
      view.cy - view.hh + 56 / zoom,
      10 / zoom,
      f.t,
      strength,
    )
  }

  /** The camera's view in painter coordinates (grid px, origin removed). */
  private viewOf(f: CfFrame): StrikeView {
    const zoom = Math.max(0.01, f.zoom)
    return {
      cx: f.cam.x - f.ox * TILE,
      cy: f.cam.y - f.oy * TILE,
      hw: f.viewport.w / zoom / 2,
      hh: f.viewport.h / zoom / 2,
    }
  }

  /** Lightning, rain splashes and the rainbow after a storm (the effects layer, drawn each frame). */
  private paintWeather(ctx: CanvasRenderingContext2D, f: CfFrame): void {
    const { world, t } = f
    const kind = world.weather?.kind ?? 'clear'
    observeWeather(this.weatherFx, kind, t)
    const view = this.viewOf(f)
    const intensity = Math.max(0, Math.min(1, world.weather?.intensity ?? 0))
    if (kind === 'storm') {
      const strike = strikeAt(t, intensity, view)
      if (strike) paintBolt(ctx, strike, view.cy - view.hh)
      const tornado = tornadoAt(t, intensity, view)
      if (tornado) paintTornado(ctx, tornado, t)
    }
    if (kind === 'rain' || kind === 'storm') {
      const { bounds, ox, oy } = f
      paintSplashes(
        ctx,
        {
          x0: (bounds.c0 - ox) * TILE,
          y0: (bounds.r0 - oy) * TILE,
          x1: (bounds.c1 - ox) * TILE,
          y1: (bounds.r1 - oy) * TILE,
        },
        t,
        intensity,
      )
    }
    paintRainbow(ctx, view, rainbowStrength(this.weatherFx, t, world.is_day))
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
    return rebuilt
  }

  /** The contested border pulses white over the tiles two tribes both claim. */
  private paintContested(ctx: CanvasRenderingContext2D, f: CfFrame): void {
    const { world, viewFlags } = f
    if (!viewFlags.territory || !world.territory || world.territory.contested.length === 0) return
    const key = `${world.frame_id}|${f.focus}`
    if (key !== this.contestedKey) {
      this.contestedKey = key
      this.contestedTiles.length = 0
      this.heat.contestedTiles(world, f.ox, f.oy, this.contestedScratch)
      const { width } = this.heat
      for (let i = 0; i < this.contestedScratch.length; i++)
        if (this.contestedScratch[i]) this.contestedTiles.push(i % width, Math.floor(i / width))
    }
    ctx.fillStyle = `rgba(255,255,255,${0.12 + Math.abs(Math.sin(f.t / 420)) * 0.16})`
    for (let i = 0; i < this.contestedTiles.length; i += 2)
      ctx.fillRect(this.contestedTiles[i] * TILE, this.contestedTiles[i + 1] * TILE, TILE, TILE)
  }

  /** Territory borders and, with the structures view, a thin outline on every built-up tile. */
  private updateTerritoryBorders(f: CfFrame): void {
    const { world, viewFlags } = f
    const outline = viewFlags.structures && !!world.grid.structure
    const key = `${viewFlags.territory ? 1 : 0}|${f.focus}|${outline ? 1 : 0}`
    if (key === this.staticKey && world.territory === this.territoryRef) {
      if (!outline || this.outlineFrame === world.frame_id) return
    }
    this.staticKey = key
    this.territoryRef = world.territory
    this.outlineFrame = world.frame_id
    this.groundStatic.begin({ zoom: f.zoom, dpr: f.dpr })
    const ctx = this.groundStatic.asContext()
    if (viewFlags.territory) paintTerritoryBorders(ctx, world, f.focus)
    if (outline) {
      const structure = world.grid.structure!
      ctx.fillStyle = 'rgba(255,210,140,0.7)'
      for (let row = 0; row < structure.length; row++) {
        const r = structure[row]
        if (!r) continue
        for (let col = 0; col < r.length; col++) {
          if (!(r[col] > 0.1)) continue
          const x = col * TILE
          const y = row * TILE
          ctx.fillRect(x, y, TILE, 1)
          ctx.fillRect(x, y + TILE - 1, TILE, 1)
          ctx.fillRect(x, y + 1, 1, TILE - 2)
          ctx.fillRect(x + TILE - 1, y + 1, 1, TILE - 2)
        }
      }
    }
    this.groundStatic.end()
  }
}
