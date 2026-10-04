import type { PrayerInfo, WorldState } from '../../../../shared/types'
import { TILE } from '../../../model/palette'

/** Everything a scenario can vary; absent fields keep the world as the simulation made it. */
export interface Scenario {
  /** Camera zoom (screen px per map px). */
  zoom: number
  /** Camera centre in tiles; defaults to the biggest settlement (or the middle of the map). */
  centre?: { x: number; y: number }
  viewport?: { w: number; h: number }
  /** 0 dawn, 0.35 noon, 0.7 dusk, 0.85 night (day_progress; is_day is derived). */
  day?: 'dawn' | 'noon' | 'dusk' | 'night'
  season?: 'growth' | 'decline' | 'scarcity' | 'recovery'
  weather?: 'clear' | 'rain' | 'storm' | 'fog'
  weatherIntensity?: number
  hardWinter?: boolean
  drought?: boolean
  overlay?: string | null
  flags?: Record<string, boolean>
  /** Synthetic effects scattered round the centre. */
  synth?: {
    battles?: number
    wards?: number
    festivals?: number
    smog?: number
    prayers?: number
    strategies?: number
    routes?: number
  }
  t?: number
}

const DAY: Record<NonNullable<Scenario['day']>, { p: number; day: boolean }> = {
  dawn: { p: 0.05, day: true },
  noon: { p: 0.35, day: true },
  dusk: { p: 0.65, day: true },
  night: { p: 0.85, day: false },
}

/** A small deterministic generator so every run places the same effects. */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

export function townCentre(world: WorldState): { x: number; y: number } {
  const ox = world.grid.origin_x ?? 0
  const oy = world.grid.origin_y ?? 0
  let best: { x: number; y: number; pop: number } | null = null
  for (const s of world.settlements ?? []) {
    if (!best || s.population > best.pop) best = { x: s.center[0] - ox, y: s.center[1] - oy, pop: s.population }
  }
  return best ?? { x: world.grid.width / 2, y: world.grid.height / 2 }
}

/** Fill the sparse per-tile grids with a smooth deterministic pattern so every overlay has something to show. */
export function ensureGrids(world: WorldState): void {
  const { width, height } = world.grid
  const make = (seed: number, scale: number) => {
    const rand = rng(seed)
    const phase = [rand() * 6, rand() * 6, rand() * 6]
    return Array.from({ length: height }, (_, y) =>
      Array.from({ length: width }, (_, x) => {
        const v =
          Math.sin(x / scale + phase[0]) * Math.cos(y / scale + phase[1]) +
          Math.sin((x + y) / (scale * 1.7) + phase[2])
        return Math.max(0, Math.min(1, v * 0.35 + 0.35))
      }),
    )
  }
  const g = world.grid
  g.hazard = make(11, 9)
  g.fertility = make(12, 14)
  g.structure = g.structure ?? make(13, 7)
  g.food_trail = make(14, 6)
  g.water_trail = make(15, 8)
  g.path_trail = make(16, 5)
  g.path_trail_hot = undefined
}

/** Territory claims: a square block round each settlement, with the overlap contested. */
export function ensureTerritory(world: WorldState): void {
  const ox = world.grid.origin_x ?? 0
  const oy = world.grid.origin_y ?? 0
  const claimed: { lid: string; tiles: [number, number][] }[] = []
  const contested: [number, number][] = []
  for (const s of world.settlements ?? []) {
    const tiles: [number, number][] = []
    const r = 6 + Math.min(10, Math.round(s.population / 8))
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue
        tiles.push([Math.round(s.center[0]) + dx, Math.round(s.center[1]) + dy])
      }
    claimed.push({ lid: s.lineage_id, tiles })
  }
  const seen = new Set<string>()
  for (const c of claimed)
    for (const [x, y] of c.tiles) {
      const k = `${x},${y}`
      if (seen.has(k)) contested.push([x, y])
      seen.add(k)
    }
  void ox
  void oy
  world.territory = { claimed, contested } as WorldState['territory']
}

/** Apply a scenario's weather, clock and synthetic effects to a copy of the world's top level. */
export function applyScenario(base: WorldState, sc: Scenario): WorldState {
  const world: WorldState = { ...base }
  const ox = base.grid.origin_x ?? 0
  const oy = base.grid.origin_y ?? 0
  const centre = sc.centre ?? townCentre(base)
  const rand = rng(1234)
  const near = (spread: number): [number, number] => [
    Math.round(centre.x + ox + (rand() - 0.5) * spread),
    Math.round(centre.y + oy + (rand() - 0.5) * spread),
  ]
  const lineages = [...new Set((base.settlements ?? []).map((s) => s.lineage_id))]
  const lid = (i: number) => lineages[i % Math.max(1, lineages.length)] ?? `L${i}`
  if (sc.day) {
    world.day_progress = DAY[sc.day].p
    world.is_day = DAY[sc.day].day
  }
  if (sc.season) world.season = sc.season as WorldState['season']
  if (sc.weather) {
    world.weather = {
      kind: (sc.weather === 'fog' ? 'wet' : sc.weather) as 'clear' | 'rain' | 'storm' | 'wet',
      intensity: sc.weather === 'clear' ? 0 : (sc.weatherIntensity ?? 0.7),
      wind_x: 0.4,
      wind_y: 0.1,
    }
  }
  if (sc.hardWinter !== undefined) world.hard_winter = sc.hardWinter
  if (sc.drought !== undefined) world.drought = sc.drought
  const synth = sc.synth ?? {}
  const tick = base.tick
  world.battles = Array.from({ length: synth.battles ?? 0 }, (_, i) => ({
    id: `b${i}`,
    attackers: [lid(i)],
    defenders: [lid(i + 1)],
    scale: i % 3 === 0 ? 'war' : i % 3 === 1 ? 'battle' : 'raid',
    location: near(40),
    started_tick: tick - 100,
    ended: i % 4 === 3,
    ended_tick: i % 4 === 3 ? tick - 200 : null,
    casualties_a: 3 + i,
    casualties_d: 2 + i,
    initial_a: 20,
    initial_d: 18,
  }))
  world.wards = Array.from({ length: synth.wards ?? 0 }, () => {
    const [x, y] = near(50)
    return { x, y, radius: 6, cast: tick - 100, until: tick + 400 }
  })
  world.festivals = Array.from({ length: synth.festivals ?? 0 }, (_, i) => {
    const [x, y] = near(50)
    return { name: 'Harvest Feast', lineage_id: lid(i), started: tick - 50, ends: tick + 300, x, y }
  })
  world.smog = Array.from({ length: synth.smog ?? 0 }, () => {
    const [x, y] = near(40)
    return { x, y, s: 1.2 }
  })
  const kinds = ['hunger', 'thirst', 'sickness', 'danger', 'rain', 'children', 'peace', 'fire', 'shelter', 'knowledge']
  world.prayers = Array.from({ length: synth.prayers ?? 0 }, (_, i): PrayerInfo => {
    const [x, y] = near(60)
    return {
      id: i + 1,
      lineage_id: lid(i),
      tribe: `tribe ${i}`,
      kind: kinds[i % kinds.length],
      x,
      y,
      created: tick - 100,
      expires: tick + 50 + ((i * 37) % 400),
    }
  })
  if (synth.strategies) {
    const names = ['hunt', 'explore', 'settle', 'trade', 'defend']
    const strategies: NonNullable<WorldState['lineage_strategies']> = {}
    lineages.slice(0, synth.strategies).forEach((l, i) => {
      strategies[l] = { strategy: names[i % names.length], expires_tick: tick + 500 }
    })
    world.lineage_strategies = strategies
  }
  if (synth.routes) {
    const towns = (base.settlements ?? []).slice(0, synth.routes + 1)
    world.trade_routes = towns.slice(1).map((s, i) => ({
      id: i + 1,
      lineage_a: towns[0].lineage_id,
      lineage_b: s.lineage_id,
      a_center: towns[0].center,
      b_center: s.center,
      established_tick: tick - 1000,
      last_dispatch_tick: tick - 10,
      deliveries: 3,
      volume: 10,
    }))
  }
  return world
}

export const MAP_TILE = TILE
