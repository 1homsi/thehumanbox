// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import type { WorldState } from '../../../../shared/types'
import type { ViewFlags } from '../../../../state/store'
import { resetPrayerFeedback } from '../../prayer-feedback'
import { resetWorldMoments } from '../../world-moments'
import { NO_FEATURES, type CfFeatures } from './features'
import { makeFrame } from './frame'
import { CfOverlayRenderer, Z } from './renderer'
import { stubHost, type StubHost } from './test-support'

const GW = 40
const GH = 24

function world(over: Partial<WorldState> = {}): WorldState {
  const matrix = (v: number) => Array.from({ length: GH }, () => Array(GW).fill(v))
  return {
    grid: {
      width: GW,
      height: GH,
      origin_x: 0,
      origin_y: 0,
      tiles: matrix(1),
      fire_intensity: matrix(0),
      structure: matrix(0),
      hazard: matrix(0.6),
      fertility: matrix(0),
      food_trail: matrix(0),
      water_trail: matrix(0),
      path_trail: matrix(0),
    },
    organisms: [],
    animals: [],
    buildings: [],
    settlements: [
      {
        lineage_id: 'a',
        name: 'Rok',
        tier: 2,
        tier_name: 'village',
        center: [12, 10],
        population: 12,
        building_count: 7,
        capacity: 20,
        score: 1,
      },
    ],
    tick: 1000,
    frame_id: 1,
    is_day: true,
    day_progress: 0.35,
    season: 'abundance',
    season_progress: 0.5,
    weather: { kind: 'clear', intensity: 0 },
    lineage_names: {},
    ...over,
  } as unknown as WorldState
}

const flags = {
  territory: false,
  fertility: false,
  hazard: false,
  trails: false,
  structures: false,
  grid: false,
  hideUI: false,
  partners: false,
  history: false,
  fps: false,
} as unknown as ViewFlags

function frameOf(w: WorldState, overlay: string | null = null, t = 5000) {
  return makeFrame({
    world: w,
    t,
    zoom: 2,
    cam: { x: 12 * 8, y: 10 * 8 },
    viewport: { w: 400, h: 240 },
    dpr: 1,
    overlay,
    focus: 'all',
    viewFlags: flags,
  })
}

function features(over: Partial<CfFeatures>): CfFeatures {
  return { ...NO_FEATURES, ...over }
}

let host: StubHost
let renderer: CfOverlayRenderer

function make(over: Partial<CfFeatures>) {
  host = stubHost()
  renderer = new CfOverlayRenderer(host, GW, GH)
  renderer.features = features(over)
  return renderer
}

afterEach(() => {
  resetPrayerFeedback()
  resetWorldMoments()
})

describe('CfOverlayRenderer', () => {
  it('registers its layers with the engine in the agreed draw order and removes them on dispose', () => {
    make({})
    const zs = host.layers.map((l) => l.zIndex)
    expect(zs).toContain(Z.tint)
    expect(zs).toContain(Z.effects)
    expect(zs).toContain(Z.hud)
    expect(Math.max(...zs.filter((z) => z < Z.effects))).toBeLessThan(Z.effects)
    expect(host.registered.size).toBeGreaterThan(5) // shape atlas + 8 glyph atlases
    renderer.dispose()
    expect(host.layers).toHaveLength(0)
    expect(host.registered.size).toBe(0)
  })

  it('draws nothing when no feature is on', () => {
    make({})
    const r = renderer.update(frameOf(world(), 'hazard'))
    expect(r.sprites).toBe(0)
    expect(host.tint).toBeNull()
  })

  it('applies the atmosphere as one screen tint (or as ground sprites in the other mode)', () => {
    make({ atmosphere: true })
    renderer.update(frameOf(world({ is_day: false, day_progress: 0.85 })))
    expect(host.tint).not.toBeNull()
    expect(host.tint!.a).toBeGreaterThan(0.2)
    renderer.update(frameOf(world()))
    expect(host.tint).toBeNull()

    make({ atmosphere: true, tint: 'ground' })
    renderer.update(frameOf(world({ is_day: false, day_progress: 0.85 })))
    expect(host.tint).toBeNull()
    const tintLayer = host.layers.find((l) => l.zIndex === Z.tint)!
    expect(tintLayer.count).toBe(2)
  })

  it('writes rain into the precipitation layer and clears it when the weather does', () => {
    make({ atmosphere: true })
    renderer.update(frameOf(world({ weather: { kind: 'rain', intensity: 1, wind_x: 0.3, wind_y: 0 } })))
    const rain = host.layers.find((l) => l.zIndex === Z.precip)!
    expect(rain.count).toBeGreaterThan(20)
    renderer.update(frameOf(world()))
    expect(rain.count).toBe(0)
  })

  it('rebuilds the heat map only when the data or a setting changes', () => {
    make({ overlays: true })
    const w = world()
    expect(renderer.update(frameOf(w, 'hazard')).heatRebuilt).toBe(true)
    expect(renderer.update(frameOf(w, 'hazard', 5100)).heatRebuilt).toBe(false)
    expect(renderer.update(frameOf(w, 'fertility', 5200)).heatRebuilt).toBe(true)
    expect(renderer.update(frameOf({ ...w, frame_id: 2 }, 'fertility', 5300)).heatRebuilt).toBe(true)
    expect(renderer.tileLayers.uploads.heat).toBe(3)
  })

  it('tints the hazard tiles and leaves the rest empty', () => {
    make({ overlays: true })
    renderer.update(frameOf(world(), 'hazard'))
    const heat = renderer.tileLayers.heat
    expect(heat.tiles.every((id) => id === 1)).toBe(true)
    renderer.update(
      frameOf(
        world({
          frame_id: 2,
          grid: { ...world().grid, hazard: Array.from({ length: GH }, () => Array(GW).fill(0)) },
        }),
        'hazard',
      ),
    )
    expect(renderer.tileLayers.heat.tiles.every((id) => id === 0)).toBe(true)
  })

  it('pulses the contested border by layer opacity and hides it without a territory view', () => {
    make({ overlays: true })
    const w = world({
      territory: { claimed: [{ lid: 'a', tiles: [[3, 3]] }], contested: [[3, 3]] },
    } as unknown as Partial<WorldState>)
    renderer.update(frameOf(w))
    expect(renderer.tileLayers.contested.opacity).toBe(0)
    const f = frameOf(w)
    f.viewFlags = { ...flags, territory: true }
    renderer.update(f)
    expect(renderer.tileLayers.contested.opacity).toBeGreaterThan(0.1)
    expect(renderer.tileLayers.contested.opacity).toBeLessThanOrEqual(0.28)
  })

  it('draws battles, wards, festivals and smog as sprites from the existing painters', () => {
    make({ effects: true })
    const w = world({
      battles: [
        {
          id: 'b',
          attackers: ['a'],
          defenders: ['b'],
          scale: 'battle',
          location: [12, 10],
          started_tick: 900,
          ended: false,
          casualties_a: 1,
          casualties_d: 2,
          initial_a: 5,
          initial_d: 5,
        },
      ],
      wards: [{ x: 14, y: 10, radius: 6, cast: 900, until: 1400 }],
      festivals: [{ name: 'Feast', lineage_id: 'a', started: 950, ends: 1300, x: 10, y: 12 }],
      smog: [{ x: 16, y: 8, s: 1 }],
    })
    const r = renderer.update(frameOf(w))
    expect(r.sprites).toBeGreaterThan(100)
    expect(r.unsupported).toEqual({})
  })

  it('places settlement labels and prayer bubbles in the HUD layers, and respects hideUI', () => {
    make({ hud: true })
    const w = world({
      prayers: [
        { id: 1, lineage_id: 'a', tribe: 'a', kind: 'hunger', x: 14, y: 12, created: 900, expires: 1500 },
      ],
    } as unknown as Partial<WorldState>)
    const shown = renderer.update(frameOf(w))
    expect(shown.sprites).toBeGreaterThan(50)
    const hud = frameOf(w)
    hud.viewFlags = { ...flags, hideUI: true }
    expect(renderer.update(hud).sprites).toBeLessThan(shown.sprites)
  })

  it('reports section timings that add up and marks the engine dirty', () => {
    make({ atmosphere: true, overlays: true, effects: true, hud: true })
    const before = host.dirtyCount
    const { times } = renderer.update(frameOf(world(), 'hazard'))
    expect(times.total).toBeGreaterThanOrEqual(times.heat)
    expect(host.dirtyCount).toBeGreaterThan(before)
  })
})
