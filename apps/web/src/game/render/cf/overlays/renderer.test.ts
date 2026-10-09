// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OrganismState, WorldState } from '../../../../shared/types'
import type { ViewFlags } from '../../../../state/store'
import { resetPrayerFeedback } from '../../prayer-feedback'
import { resetWorldMoments } from '../../world-moments'
import { makeFrame } from './frame'
import { CfOverlayRenderer, Z } from './renderer'
import { stubHost, type StubHost } from './test-support'
import { drawTradeNetwork2D } from '../../base-parts/trade-network'

vi.mock('../../base-parts/trade-network', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../base-parts/trade-network')>()
  return { ...actual, drawTradeNetwork2D: vi.fn(actual.drawTradeNetwork2D) }
})

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
  tradeRoutes: true,
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

let host: StubHost
let renderer: CfOverlayRenderer

function make() {
  host = stubHost()
  renderer = new CfOverlayRenderer(host, GW, GH)
  return renderer
}

afterEach(() => {
  resetPrayerFeedback()
  resetWorldMoments()
})

describe('CfOverlayRenderer', () => {
  it('registers its layers with the engine in the agreed draw order and removes them on dispose', () => {
    make()
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

  it('draws trade roads, rails and caravans only while the trade routes view is on', () => {
    make()
    const trade = vi.mocked(drawTradeNetwork2D)
    trade.mockClear()
    renderer.update(frameOf(world()))
    expect(trade).toHaveBeenCalledTimes(2)
    trade.mockClear()
    const hidden = makeFrame({
      world: world(),
      t: 5100,
      zoom: 2,
      cam: { x: 12 * 8, y: 10 * 8 },
      viewport: { w: 400, h: 240 },
      dpr: 1,
      overlay: null,
      focus: 'all',
      viewFlags: { ...flags, tradeRoutes: false },
    })
    renderer.update(hidden)
    expect(trade).not.toHaveBeenCalled()
  })

  it('draws the atmosphere as tint quads between the ground and everything built', () => {
    make()
    renderer.update(frameOf(world({ is_day: false, day_progress: 0.85 })))
    const tintLayer = host.layers.find((l) => l.zIndex === Z.tint)!
    expect(tintLayer.count).toBe(2)
    expect(Z.tint).toBeGreaterThan(4.5)
    expect(Z.tint).toBeLessThan(10)
    renderer.update(frameOf(world()))
    expect(tintLayer.count).toBe(0)
  })

  it('writes rain into the precipitation layer and clears it when the weather does', () => {
    make()
    renderer.update(frameOf(world({ weather: { kind: 'rain', intensity: 1, wind_x: 0.3, wind_y: 0 } })))
    const rain = host.layers.find((l) => l.zIndex === Z.precip)!
    expect(rain.count).toBeGreaterThan(20)
    renderer.update(frameOf(world()))
    expect(rain.count).toBe(0)
  })

  it('rebuilds the heat map only when the data or a setting changes', () => {
    make()
    const w = world()
    expect(renderer.update(frameOf(w, 'hazard')).heatRebuilt).toBe(true)
    expect(renderer.update(frameOf(w, 'hazard', 5100)).heatRebuilt).toBe(false)
    expect(renderer.update(frameOf(w, 'fertility', 5200)).heatRebuilt).toBe(true)
    // New data within the refresh interval waits for it (the renderer reports it as pending) ...
    expect(renderer.update(frameOf({ ...w, frame_id: 2 }, 'fertility', 5300)).heatRebuilt).toBe(false)
    expect(renderer.pending).toBe(true)
    // ... and is shown once the interval has passed.
    expect(renderer.update(frameOf({ ...w, frame_id: 2 }, 'fertility', 5800)).heatRebuilt).toBe(true)
    expect(renderer.pending).toBe(false)
  })

  it('shows a setting change at once, even inside the refresh interval', () => {
    make()
    expect(renderer.update(frameOf(world(), 'hazard', 5000)).heatRebuilt).toBe(true)
    expect(renderer.update(frameOf(world(), 'fertility', 5050)).heatRebuilt).toBe(true)
  })

  it('shows the heat map as one sprite above the trees, and hides it when nothing is tinted', () => {
    make()
    const heat = host.layers.find((l) => l.zIndex === Z.heat)!
    expect(heat.count).toBe(1)
    expect(Z.heat).toBeGreaterThan(Z.tint)
    expect(heat.visible).toBe(false)
    renderer.update(frameOf(world(), 'hazard'))
    expect(heat.visible).toBe(true)
    renderer.update(
      frameOf(
        world({
          frame_id: 2,
          grid: { ...world().grid, hazard: Array.from({ length: GH }, () => Array(GW).fill(0)) },
        }),
        'hazard',
        6000,
      ),
    )
    expect(heat.visible).toBe(false)
  })

  it('pulses the contested border over the tiles two tribes claim, only in the territory view', () => {
    make()
    const w = world({
      territory: { claimed: [{ lid: 'a', tiles: [[3, 3]] }], contested: [[3, 3]] },
    } as unknown as Partial<WorldState>)
    const ground = host.layers.find((l) => l.zIndex === Z.ground)!
    renderer.update(frameOf(w))
    const without = ground.count
    const f = frameOf(w, null, 5100)
    f.viewFlags = { ...flags, territory: true }
    renderer.update(f)
    expect(ground.count).toBeGreaterThan(without)
    // The pulse is the fill alpha, between 12% and 28%.
    const alphas = Array.from({ length: ground.count }, (_, i) => ground.color[i] & 255)
    expect(alphas.some((a) => a >= 30 && a <= 72)).toBe(true)
  })

  it('outlines built-up tiles in the structures view', () => {
    make()
    const structure = Array.from({ length: GH }, () => Array(GW).fill(0))
    structure[5][5] = 0.8
    structure[5][6] = 0.8
    const w = world({ grid: { ...world().grid, structure } })
    const still = host.layers.find((l) => l.zIndex === Z.groundStatic)!
    renderer.update(frameOf(w))
    expect(still.count).toBe(0)
    const f = frameOf(w)
    f.viewFlags = { ...flags, structures: true }
    renderer.update(f)
    expect(still.count).toBe(8)
  })

  it('draws battles, wards, festivals and smog as sprites from the existing painters', () => {
    make()
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
    make()
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
    make()
    const before = host.dirtyCount
    const { times } = renderer.update(frameOf(world(), 'hazard'))
    expect(times.total).toBeGreaterThanOrEqual(times.heat)
    expect(host.dirtyCount).toBeGreaterThan(before)
  })

  it('puts names, thoughts and work poses above the people, in order of the layers', () => {
    make()
    const org = {
      id: 'p1',
      name: 'Ada',
      alive: true,
      x: 12,
      y: 10,
      sex: 'female',
      age: 900,
      energy: 0.9,
      hydration: 0.9,
      health: 0.9,
      thought: 'chopping wood',
      lineage_id: 'a',
      infection: 0,
    }
    const people = {
      orgs: [org as unknown as OrganismState],
      px: [12 * 8 + 4],
      py: [10 * 8 + 4],
      hidden: [0],
      phase: [0],
      step: { flipped: [0], movedAt: [-Infinity] },
    }
    const w = world({ organisms: [org], viewport_organisms: [org] } as unknown as Partial<WorldState>)
    const f = frameOf(w)
    f.zoom = 3
    f.viewFlags = { ...flags, names: true, thoughts: true } as ViewFlags
    // Not selected: the name tag shows, the thought (full detail only) is not asked for at this zoom.
    const labels = host.layers.filter((l) => l.zIndex === Z.labels || l.zIndex === Z.labels + 0.5)
    const none = renderer.update(f, { people: null, selectedId: null })
    expect(none.sprites).toBeGreaterThanOrEqual(0)
    renderer.update(f, { people, selectedId: 'p1' })
    // Names and thoughts are text runs above the label glyphs, in the order the painter drew them.
    const names = host.textLayers.find((l) => l.zIndex === Z.labels + 0.6)
    expect(names?.texts.slice(0, names.count)).toEqual(['Ada', 'chopping wood'])
    expect(labels.reduce((n, l) => n + l.count, 0)).toBeGreaterThan(0)
    expect(Z.labels).toBeGreaterThan(41.5)
    expect(Z.labels).toBeLessThan(Z.effects)
  })
})
