// Trade routes planned over the land. The simulation only says "these two settlements trade"; the road
// between them is worked out here, the way a village lays one (crates/sim-core/.../village_roads.rs):
// the cheapest walk over open ground, round water, rock and buildings, keeping to roads already there.
// A planned route is a list of tiles, so it is drawn as tile roads that join the village roads.

import type { WorldState } from '../../shared/types'
import { TILE_ID } from '../model/terrain-ids'
import { eraTier } from '../model/era-tier'
import { ROAD_BRIDGE, ROAD_CANAL, ROAD_RAIL, ROAD_TRACK } from './cf/roads/road-art'

/** Padding round a route's bounding box that the search may use: a detour round a lake or a ridge. */
export const PLAN_PAD = 32
/** Most cells one search may expand before the route is given up. */
export const PLAN_BUDGET = 20_000
/** The widest stretch of water a bridge crosses, in tiles. */
export const MAX_SPAN = 6
/** Cost of a step onto a road, open ground and water (a bridge). */
const COST_ROAD = 1
const COST_GROUND = 2
const COST_WATER = 3
/** A level crossing over a railway, or a bridge over a canal: rails and canals cut towns in pieces. */
const COST_CROSSING = 4
/** How far from a settlement's centre its road may start, since the centre is usually built over. */
const SNAP_RADIUS = 4
/** A tile of a planned road that crosses water or a canal. */
export const PLANNED_BRIDGE = 4

/** Tiles a road can be laid on (the simulation's `road_ground`). */
const GROUND = new Set<number>([TILE_ID.GRASS, TILE_ID.SAND, TILE_ID.SNOW, TILE_ID.ASH, TILE_ID.FOOD])

/** Buildings a road passes through or beside: small things that do not fill a tile. */
const PASSABLE_KINDS = new Set(['cart', 'food_cart', 'signpost', 'gate', 'bench'])

type Rows = readonly (readonly number[])[]

/** The land a route is planned over, in grid cells. */
export interface PlanGrid {
  width: number
  height: number
  tiles: Rows
  /** Road kind per cell (see `road-art`); absent before the first static frame. */
  roads?: Rows
  /** 1 where a building stands. */
  blocked?: Uint8Array
  /** Non-zero where a route is already planned: following it is cheap. */
  planned?: Uint8Array
}

/** The cost of stepping onto a cell, or 0 where nobody can build a road. */
function stepCost(grid: PlanGrid, x: number, y: number, bridging: boolean): number {
  const idx = y * grid.width + x
  const road = grid.roads?.[y]?.[x] ?? 0
  const planned = grid.planned?.[idx] ?? 0
  if (grid.blocked?.[idx]) return 0
  if (road === ROAD_RAIL || road === ROAD_CANAL) return planned ? COST_ROAD : COST_CROSSING
  if (road === ROAD_TRACK || road === ROAD_BRIDGE) return COST_ROAD
  if (planned & PLANNED_BRIDGE) return COST_ROAD
  const tile = grid.tiles[y]?.[x]
  if (tile === undefined) return 0
  if (GROUND.has(tile)) return planned ? COST_ROAD : COST_GROUND
  if (bridging && tile === TILE_ID.WATER) return planned ? COST_ROAD : COST_WATER
  return 0
}

// Scratch buffers, grown to the largest search and reused so planning does not allocate per route.
let costs = new Int32Array(0)
let parents = new Int32Array(0)
let heapKey = new Float64Array(0)
let heapVal = new Int32Array(0)
let heapSize = 0

/** Cheapest first; among equals the one furthest along, so routes run straight before they turn. */
const G_RANGE = 1 << 20

function heapPush(key: number, val: number): void {
  if (heapSize === heapKey.length) {
    const next = Math.max(256, heapSize * 2)
    const k = new Float64Array(next)
    const v = new Int32Array(next)
    k.set(heapKey)
    v.set(heapVal)
    heapKey = k
    heapVal = v
  }
  let i = heapSize++
  while (i > 0) {
    const p = (i - 1) >> 1
    if (heapKey[p]! <= key) break
    heapKey[i] = heapKey[p]!
    heapVal[i] = heapVal[p]!
    i = p
  }
  heapKey[i] = key
  heapVal[i] = val
}

/** Removes the smallest entry; its key is left in `poppedKey`. */
let poppedKey = 0
function heapPop(): number {
  const top = heapVal[0]!
  poppedKey = heapKey[0]!
  const key = heapKey[--heapSize]!
  const val = heapVal[heapSize]!
  let i = 0
  for (;;) {
    let c = 2 * i + 1
    if (c >= heapSize) break
    if (c + 1 < heapSize && heapKey[c + 1]! < heapKey[c]!) c++
    if (heapKey[c]! >= key) break
    heapKey[i] = heapKey[c]!
    heapVal[i] = heapVal[c]!
    i = c
  }
  heapKey[i] = key
  heapVal[i] = val
  return top
}

/**
 * The cheapest walk between two settlement centres `from` and `to` (`[col, row]`), as the road cells in order
 * (indices `row * width + col`). A centre is usually built over, so the road starts at any free cell within
 * `reach` of the first centre and ends at any within `reach` of the second, and the walk to the centre itself
 * costs a step a tile. Steps are four-way: roads and planned routes cost 1, open ground 2, and with `bridging`
 * water 3. `null` when no way exists inside the search box, or the search outgrows `budget` cells.
 */
export function planPath(
  grid: PlanGrid,
  from: readonly [number, number],
  to: readonly [number, number],
  bridging = false,
  budget = PLAN_BUDGET,
  pad = PLAN_PAD,
  reach = SNAP_RADIUS,
): Int32Array | null {
  const x0 = Math.max(0, Math.min(from[0], to[0]) - pad)
  const y0 = Math.max(0, Math.min(from[1], to[1]) - pad)
  const x1 = Math.min(grid.width - 1, Math.max(from[0], to[0]) + pad)
  const y1 = Math.min(grid.height - 1, Math.max(from[1], to[1]) + pad)
  const w = x1 - x0 + 1
  const h = y1 - y0 + 1
  if (w <= 0 || h <= 0) return null
  const n = w * h
  // One slot past the cells stands for the far centre: every cell within reach of it can step there.
  const goal = n
  if (costs.length < n + 1) {
    costs = new Int32Array(n + 1)
    parents = new Int32Array(n + 1)
  }
  costs.fill(-1, 0, n + 1)
  heapSize = 0
  const [tx, ty] = to
  for (let y = Math.max(y0, from[1] - reach); y <= Math.min(y1, from[1] + reach); y++) {
    for (let x = Math.max(x0, from[0] - reach); x <= Math.min(x1, from[0] + reach); x++) {
      // A road starts on dry ground, never on a bridge over nothing.
      if (stepCost(grid, x, y, false) === 0) continue
      const g = Math.abs(x - from[0]) + Math.abs(y - from[1])
      const cell = (y - y0) * w + (x - x0)
      costs[cell] = g
      parents[cell] = -1
      heapPush((g + Math.abs(x - tx) + Math.abs(y - ty)) * G_RANGE + (G_RANGE - 1 - g), cell)
    }
  }
  let expanded = 0
  while (heapSize > 0) {
    const cur = heapPop()
    const g = G_RANGE - 1 - (poppedKey % G_RANGE)
    if (costs[cur] !== g) continue
    if (cur === goal) {
      let len = 0
      for (let c = parents[goal]!; c !== -1; c = parents[c]!) len++
      const path = new Int32Array(len)
      for (let c = parents[goal]!, i = len - 1; c !== -1; c = parents[c]!, i--) {
        path[i] = (y0 + Math.floor(c / w)) * grid.width + (x0 + (c % w))
      }
      return path
    }
    if (++expanded > budget) return null
    const cx = x0 + (cur % w)
    const cy = y0 + Math.floor(cur / w)
    if (Math.abs(cx - tx) <= reach && Math.abs(cy - ty) <= reach && stepCost(grid, cx, cy, false) !== 0) {
      const exit = g + Math.abs(cx - tx) + Math.abs(cy - ty)
      if (costs[goal] === -1 || exit < costs[goal]!) {
        costs[goal] = exit
        parents[goal] = cur
        heapPush(exit * G_RANGE + (G_RANGE - 1 - Math.min(exit, G_RANGE - 1)), goal)
      }
    }
    for (let d = 0; d < 4; d++) {
      const nx = d === 0 ? cx + 1 : d === 1 ? cx - 1 : cx
      const ny = d === 2 ? cy + 1 : d === 3 ? cy - 1 : cy
      if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue
      const step = stepCost(grid, nx, ny, bridging)
      if (step === 0) continue
      const next = (ny - y0) * w + (nx - x0)
      const ng = g + step
      const known = costs[next]!
      if (known !== -1 && known <= ng) continue
      costs[next] = ng
      parents[next] = cur
      const f = ng + Math.abs(nx - tx) + Math.abs(ny - ty)
      heapPush(f * G_RANGE + (G_RANGE - 1 - Math.min(ng, G_RANGE - 1)), next)
    }
  }
  return null
}

/** Whether a planned way crosses no more than `MAX_SPAN` tiles of open water in a row. */
function bridgesAreShort(grid: PlanGrid, path: Int32Array): boolean {
  let run = 0
  for (const idx of path) {
    const x = idx % grid.width
    const y = Math.floor(idx / grid.width)
    const wet = grid.tiles[y]?.[x] === TILE_ID.WATER && (grid.roads?.[y]?.[x] ?? 0) !== ROAD_BRIDGE
    run = wet ? run + 1 : 0
    if (run > MAX_SPAN) return false
  }
  return true
}

/**
 * A road between two settlement centres (cells): over dry ground when it can, bridging narrow water
 * when it has to (the order a village tries them in).
 */
export function planRoute(
  grid: PlanGrid,
  a: readonly [number, number],
  b: readonly [number, number],
  budget = PLAN_BUDGET,
): Int32Array | null {
  const dry = planPath(grid, a, b, false, budget)
  if (dry) return dry
  const wet = planPath(grid, a, b, true, budget)
  return wet && bridgesAreShort(grid, wet) ? wet : null
}

/** A planned route as a polyline in cells: the settlement centre, each road tile, the other centre. */
export interface PlannedPath {
  /** Road tiles from the `a` end to the `b` end, as `row * width + col`. */
  cells: Int32Array
  /** The polyline's points in cell coordinates (a tile's own coordinate, not its centre). */
  xs: Float32Array
  ys: Float32Array
  /** Length along the polyline at each point. */
  cum: Float32Array
  total: number
  /** The extent of the polyline in cells. */
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export function buildPath(
  cells: Int32Array,
  width: number,
  a: readonly [number, number],
  b: readonly [number, number],
): PlannedPath {
  const n = cells.length + 2
  const xs = new Float32Array(n)
  const ys = new Float32Array(n)
  const cum = new Float32Array(n)
  xs[0] = a[0]
  ys[0] = a[1]
  for (let i = 0; i < cells.length; i++) {
    xs[i + 1] = cells[i]! % width
    ys[i + 1] = Math.floor(cells[i]! / width)
  }
  xs[n - 1] = b[0]
  ys[n - 1] = b[1]
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1]! + Math.hypot(xs[i]! - xs[i - 1]!, ys[i]! - ys[i - 1]!)
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, xs[i]!)
    maxX = Math.max(maxX, xs[i]!)
    minY = Math.min(minY, ys[i]!)
    maxY = Math.max(maxY, ys[i]!)
  }
  return { cells, xs, ys, cum, total: cum[n - 1]!, minX, maxX, minY, maxY }
}

/** A point on a path and the way it is heading there. */
export interface PathPoint {
  x: number
  y: number
  angle: number
}

/**
 * The point `progress` (0 to 1) of the way along `path` by distance, written to `out`. `reverse` walks it from
 * the `b` end. The heading is the way the path runs there, turned round when walking in reverse.
 */
export function pointAlong(path: PlannedPath, progress: number, reverse: boolean, out: PathPoint): PathPoint {
  const t = Math.max(0, Math.min(1, progress))
  const d = (reverse ? 1 - t : t) * path.total
  const { cum, xs, ys } = path
  let lo = 0
  let hi = cum.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (cum[mid]! <= d) lo = mid
    else hi = mid
  }
  const seg = cum[hi]! - cum[lo]!
  const k = seg > 0 ? (d - cum[lo]!) / seg : 0
  const dx = xs[hi]! - xs[lo]!
  const dy = ys[hi]! - ys[lo]!
  out.x = xs[lo]! + dx * k
  out.y = ys[lo]! + dy * k
  out.angle = dx === 0 && dy === 0 ? 0 : Math.atan2(reverse ? -dy : dy, reverse ? -dx : dx)
  return out
}

/** The road style code in `TradePathPlanner.cells`: 1 a track, 2 cobbles, 3 asphalt (add `PLANNED_BRIDGE` over water). */
export function styleCodeOf(tier: number): number {
  return tier >= 5 ? 3 : tier >= 2 ? 2 : 1
}

interface RouteRef {
  id: number
  key: string
  /** Settlement centres in cells of the grid. */
  a: [number, number]
  b: [number, number]
  tier: number
}

interface Entry {
  path: PlannedPath | null
  /** Terrain generation this was planned in; an older one is shown until it is replanned. */
  gen: number
}

const MAX_ROUTES = 160
/** Most routes planned per `update`, and the time after which it stops for the frame (ms). */
const PLAN_PER_UPDATE = 3
const PLAN_MS_PER_UPDATE = 6

/**
 * Plans every trade route of the world over its land and keeps the result. A route is planned once per pair
 * of endpoints; it is planned again only when the terrain revision changes or a building comes to stand on
 * it. New work is spread over calls (a few routes each), so loading a big world does not hitch, and the old
 * plan stays on screen until its replacement is ready.
 */
export class TradePathPlanner {
  /** Bumped whenever `cells` or a route's path changes. */
  revision = 0
  /** Per grid cell: 0 no road, else the style code (`styleCodeOf`), plus `PLANNED_BRIDGE` over water. */
  cells = new Uint8Array(0)
  stats = { routes: 0, planned: 0, noWay: 0, ms: 0, slowestUpdateMs: 0, pending: 0 }
  private width = 0
  private height = 0
  private originX = 0
  private originY = 0
  private terrainRevision = -1
  private gen = 0
  private routesSrc: WorldState['trade_routes'] | symbol = Symbol()
  private routesHash = NaN
  private erasSrc: WorldState['lineage_eras'] | symbol = Symbol()
  private buildingsSrc: WorldState['buildings'] | symbol = Symbol()
  private buildingsSig = NaN
  private blocked = new Uint8Array(0)
  private routes: RouteRef[] = []
  private entries = new Map<string, Entry>()
  private byId = new Map<number, PlannedPath | null>()
  private queue: string[] = []
  private queued = new Set<string>()
  private tiers = new Map<string, number>()
  private tilesSrc: Rows = []
  private roadsSrc: Rows | undefined

  /** The planned path of a trade route, or `null` when it has none (or is not planned yet). */
  pathOf(routeId: number): PlannedPath | null {
    return this.byId.get(routeId) ?? null
  }

  /** Whether every route has been planned. */
  get settled(): boolean {
    return this.queue.length === 0
  }

  /**
   * Bring the plan up to date with `world`: notice changed routes, terrain or buildings, then plan a few
   * routes. Returns true when anything drawn changed. Cheap when nothing did (a few comparisons).
   */
  update(world: WorldState, terrainRevision: number): boolean {
    const grid = world.grid
    const { width, height } = grid
    // Revision 0 is a terrain that has not arrived whole yet (the other layers wait for it too).
    if (terrainRevision === 0 || !grid.tiles || grid.tiles.length < height || width <= 0) return false
    const ox = grid.origin_x ?? 0
    const oy = grid.origin_y ?? 0
    if (width !== this.width || height !== this.height || ox !== this.originX || oy !== this.originY) {
      this.reset(width, height, ox, oy)
    }
    this.tilesSrc = grid.tiles
    this.roadsSrc = grid.roads
    let dirty = false

    if (terrainRevision !== this.terrainRevision) {
      this.terrainRevision = terrainRevision
      this.gen++
      for (const route of this.routes) this.enqueue(route.key)
    }
    const erasChanged = world.lineage_eras !== this.erasSrc
    if (erasChanged) {
      this.erasSrc = world.lineage_eras
      this.tiers = tiersOf(world.lineage_eras)
    }
    if (world.trade_routes !== this.routesSrc || erasChanged) {
      this.routesSrc = world.trade_routes
      // A frame often carries the same routes in a new array: do nothing for those.
      const hash = hashRoutes(world.trade_routes)
      if (hash !== this.routesHash || erasChanged) {
        this.routesHash = hash
        dirty = this.readRoutes(world) || dirty
      }
    }
    if (world.buildings !== this.buildingsSrc) {
      this.buildingsSrc = world.buildings
      dirty = this.readBuildings(world.buildings) || dirty
    }
    if (this.queue.length > 0) dirty = this.planSome(world) || dirty
    if (dirty) {
      this.rebuild()
      this.revision++
    }
    return dirty
  }

  private reset(width: number, height: number, ox: number, oy: number): void {
    this.width = width
    this.height = height
    this.originX = ox
    this.originY = oy
    this.cells = new Uint8Array(width * height)
    this.blocked = new Uint8Array(width * height)
    this.routesSrc = Symbol()
    this.routesHash = NaN
    this.buildingsSrc = Symbol()
    this.buildingsSig = NaN
    this.routes = []
    this.entries.clear()
    this.byId.clear()
    this.queue.length = 0
    this.queued.clear()
    this.terrainRevision = -1
  }

  private enqueue(key: string): void {
    if (this.queued.has(key)) return
    this.queued.add(key)
    this.queue.push(key)
  }

  /** The routes of the world as cells of the grid; plans the ones not seen before. True when the set changed. */
  private readRoutes(world: WorldState): boolean {
    const out: RouteRef[] = []
    const seen = new Set<string>()
    let changed = false
    for (const r of world.trade_routes ?? []) {
      if (out.length >= MAX_ROUTES) break
      if (!Number.isFinite(r.a_center[0]) || !Number.isFinite(r.a_center[1])) continue
      if (!Number.isFinite(r.b_center[0]) || !Number.isFinite(r.b_center[1])) continue
      const a: [number, number] = [r.a_center[0] - this.originX, r.a_center[1] - this.originY]
      const b: [number, number] = [r.b_center[0] - this.originX, r.b_center[1] - this.originY]
      if (!this.inGrid(a) || !this.inGrid(b)) continue
      const key = `${a[0]},${a[1]}|${b[0]},${b[1]}`
      const tier = Math.max(this.tiers.get(r.lineage_a) ?? 0, this.tiers.get(r.lineage_b) ?? 0)
      out.push({ id: r.id, key, a, b, tier })
      seen.add(key)
      if (!this.entries.has(key)) this.enqueue(key)
    }
    if (out.length !== this.routes.length) changed = true
    else
      for (let i = 0; i < out.length; i++) {
        const prev = this.routes[i]!
        if (prev.key !== out[i]!.key || prev.tier !== out[i]!.tier || prev.id !== out[i]!.id) changed = true
      }
    for (const key of this.entries.keys()) {
      if (!seen.has(key)) {
        this.entries.delete(key)
        changed = true
      }
    }
    this.routes = out
    return changed
  }

  private inGrid(p: readonly [number, number]): boolean {
    return p[0] >= 0 && p[1] >= 0 && p[0] < this.width && p[1] < this.height
  }

  /** Marks the building footprints; a planned route a new building now stands on is planned again. */
  private readBuildings(buildings: WorldState['buildings']): boolean {
    let sig = 0
    let count = 0
    for (const b of buildings ?? []) {
      if (b.ruined || PASSABLE_KINDS.has(b.kind)) continue
      const fw = Math.max(1, Math.floor(b.footprint?.[0] ?? b.fw ?? 1))
      const fh = Math.max(1, Math.floor(b.footprint?.[1] ?? b.fh ?? 1))
      sig = (sig + (Math.imul(b.x, 73856093) ^ Math.imul(b.y, 19349663) ^ (fw * 31 + fh))) | 0
      count++
    }
    sig = (sig + count) | 0
    if (sig === this.buildingsSig) return false
    this.buildingsSig = sig
    const blocked = this.blocked
    blocked.fill(0)
    for (const b of buildings ?? []) {
      if (b.ruined || PASSABLE_KINDS.has(b.kind)) continue
      const fw = Math.max(1, Math.floor(b.footprint?.[0] ?? b.fw ?? 1))
      const fh = Math.max(1, Math.floor(b.footprint?.[1] ?? b.fh ?? 1))
      for (let dy = 0; dy < fh; dy++) {
        for (let dx = 0; dx < fw; dx++) {
          const x = Math.floor(b.x + dx) - this.originX
          const y = Math.floor(b.y + dy) - this.originY
          if (x >= 0 && y >= 0 && x < this.width && y < this.height) blocked[y * this.width + x] = 1
        }
      }
    }
    // Roads laid before a building went up: plan the ones it now stands on again, keep the rest.
    let changed = false
    for (const route of this.routes) {
      const path = this.entries.get(route.key)?.path
      if (!path) continue
      if (path.cells.some((c) => blocked[c])) {
        this.enqueue(route.key)
        changed = true
      }
    }
    return changed
  }

  /** Plans queued routes until the per-call allowance runs out. True when a route was planned. */
  private planSome(world: WorldState): boolean {
    const t0 = performance.now()
    const grid: PlanGrid = {
      width: this.width,
      height: this.height,
      tiles: world.grid.tiles,
      roads: world.grid.roads,
      blocked: this.blocked,
      planned: this.cells,
    }
    let did = 0
    while (this.queue.length > 0 && did < PLAN_PER_UPDATE && performance.now() - t0 < PLAN_MS_PER_UPDATE) {
      const key = this.queue.shift()!
      this.queued.delete(key)
      const route = this.routes.find((r) => r.key === key)
      if (!route) continue
      const t1 = performance.now()
      const cells = planRoute(grid, route.a, route.b)
      this.entries.set(key, {
        path: cells ? buildPath(cells, this.width, route.a, route.b) : null,
        gen: this.gen,
      })
      this.stats.ms += performance.now() - t1
      this.stats.planned++
      did++
      // A route planned now shapes the ones planned after it (they prefer to join it).
      if (cells) this.stamp(route, cells)
    }
    this.stats.pending = this.queue.length
    this.stats.slowestUpdateMs = Math.max(this.stats.slowestUpdateMs, performance.now() - t0)
    return did > 0
  }

  /** Lays one planned route into `cells` straight away, so the next search can follow it. */
  private stamp(route: RouteRef, cells: Int32Array): void {
    const style = styleCodeOf(route.tier)
    for (const idx of cells) {
      const y = Math.floor(idx / this.width)
      const x = idx % this.width
      const water = this.tilesSrc[y]?.[x] === TILE_ID.WATER || this.roadsSrc?.[y]?.[x] === ROAD_CANAL
      const prev = this.cells[idx]!
      this.cells[idx] = Math.max(prev & 3, style) | (water ? PLANNED_BRIDGE : 0) | (prev & PLANNED_BRIDGE)
    }
  }

  /** Rebuilds `cells` and the by-id lookup from the planned routes. */
  private rebuild(): void {
    this.cells.fill(0)
    this.byId.clear()
    let noWay = 0
    for (const route of this.routes) {
      const entry = this.entries.get(route.key)
      if (!entry) continue
      this.byId.set(route.id, entry.path)
      if (!entry.path) {
        noWay++
        continue
      }
      this.stamp(route, entry.path.cells)
    }
    this.stats.routes = this.routes.length
    this.stats.noWay = noWay
  }
}

/** A number that changes when a route's ends or tribes do; computed without allocating. */
function hashRoutes(routes: WorldState['trade_routes']): number {
  let h = routes?.length ?? 0
  for (const r of routes ?? []) {
    h = Math.imul(h ^ r.id, 0x9e3779b1)
    h = Math.imul(h ^ (r.a_center[0] * 4099 + r.a_center[1]), 0x85ebca6b)
    h = Math.imul(h ^ (r.b_center[0] * 4099 + r.b_center[1]), 0xc2b2ae35)
    for (let i = 0; i < r.lineage_a.length; i++) h = Math.imul(h ^ r.lineage_a.charCodeAt(i), 0x27d4eb2f)
    for (let i = 0; i < r.lineage_b.length; i++) h = Math.imul(h ^ r.lineage_b.charCodeAt(i), 0x165667b1)
  }
  return h
}

/** Each lineage's era tier. */
function tiersOf(eras: WorldState['lineage_eras']): Map<string, number> {
  const out = new Map<string, number>()
  if (!eras) return out
  if (Array.isArray(eras)) for (const e of eras) out.set(e.lineage_id, eraTier(e.era_name))
  else for (const [id, era] of Object.entries(eras)) out.set(id, eraTier(era))
  return out
}

/** The planner the road layer drives and the trade overlay reads. */
export const tradePaths = new TradePathPlanner()
