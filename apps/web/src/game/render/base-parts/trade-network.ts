import { lineageEraTiers } from '../draw-helpers'
import type {
  CaravanInfo,
  MigrationInfo,
  NetEdgeInfo,
  TradeRouteInfo,
  WorldState,
} from '../../../shared/types'
import { lineageColor } from '../../../shared/constants'
import { drawCaravanPennant, drawCaravanSprite, drawTraffic } from '../roads'
import {
  buildPath,
  pointAlong,
  simCells,
  tradePaths,
  type PathPoint,
  type PlannedPath,
  type TradePathPlanner,
} from '../trade-paths'
import { motionTime } from '../../../shared/motion'
import { TILE } from '../../model/palette'
import { cargoColorOf } from '../../model/cargo'

const MAX_TRADE_ROUTES_2D = 48
const MAX_CARAVANS_2D = 64

function isFinitePoint(point: [number, number]): boolean {
  return Number.isFinite(point[0]) && Number.isFinite(point[1])
}

function routeOf(routes: TradeRouteInfo[] | undefined, id: number): TradeRouteInfo | undefined {
  if (!routes) return undefined
  for (let i = 0; i < routes.length; i++) if (routes[i]!.id === id) return routes[i]
  return undefined
}

const MAX_WAY_PATHS = 256
const wayPaths = new Map<string, PlannedPath | null>()
let wayEdgesSrc: WorldState['net_edges'] | symbol = Symbol()
let wayEdges = new Map<number, NetEdgeInfo>()

export function caravanWayPath(
  world: WorldState,
  caravan: CaravanInfo,
  ox: number,
  oy: number,
): PlannedPath | null {
  if (!caravan.way?.length) return null
  if (world.net_edges !== wayEdgesSrc) {
    wayEdgesSrc = world.net_edges
    wayEdges = new Map()
    for (const e of world.net_edges ?? []) if (e.kind === 'road') wayEdges.set(e.id, e)
    wayPaths.clear()
  }
  const key = `${ox},${oy}:${caravan.way.map(([id, back]) => (back ? -id : id)).join(',')}`
  let path = wayPaths.get(key)
  if (path === undefined) {
    const { width, height } = world.grid
    const cells = simCells(caravan.way, wayEdges, ox, oy, width, height)
    path = cells
      ? buildPath(
          cells,
          width,
          [caravan.from[0] - ox, caravan.from[1] - oy],
          [caravan.to[0] - ox, caravan.to[1] - oy],
        )
      : null
    if (wayPaths.size >= MAX_WAY_PATHS) wayPaths.clear()
    wayPaths.set(key, path)
  }
  return path
}

/** Reused every call, so drawing the network allocates nothing per frame. */
const at: PathPoint = { x: 0, y: 0, angle: 0 }
const routePaths: { route: TradeRouteInfo; path: PlannedPath }[] = []
const caravansInView: { caravan: CaravanInfo; x: number; y: number; angle: number }[] = []
/** How many of `caravansInView` the last caravan draw put on the map, and the grid corner they are measured from. */
let caravansDrawn = 0
const caravanOrigin = { x: 0, y: 0 }
let tiersFor: WorldState['lineage_eras']
let tiers = new Map<string, number>()

/**
 * The id of the caravan drawn nearest a world point (in tiles, as the sim numbers them), within `reach`
 * tiles of its centre, or null. Reads where the last caravan draw put them, so the hover card names
 * exactly the caravans on screen and never one that is off the map.
 */
export function caravanDrawnAt(worldX: number, worldY: number, reach: number): number | null {
  let best: number | null = null
  let bestDistance = reach
  for (let i = 0; i < caravansDrawn; i++) {
    const slot = caravansInView[i]!
    const distance = Math.hypot(
      slot.x + 0.5 + caravanOrigin.x - worldX,
      slot.y + 0.5 + caravanOrigin.y - worldY,
    )
    if (distance < bestDistance) {
      bestDistance = distance
      best = slot.caravan.id
    }
  }
  return best
}

/**
 * What moves on the trade roads: cars on the asphalt of the modern ages and the red barrier of a road closed by
 * war (the `roads` layer, under the people), and the caravans (the `caravans` layer). The roads themselves are
 * tile roads that `planner` plans over the land and the road layer draws. A caravan follows its route's planned
 * road by distance; with none (no way over the land) it moves in a straight line, as before.
 */
export function drawTradeNetwork2D(
  ctx: CanvasRenderingContext2D,
  world: WorldState,
  bounds: { c0: number; c1: number; r0: number; r1: number },
  now: number,
  layer: 'roads' | 'caravans',
  planner: TradePathPlanner = tradePaths,
) {
  caravansDrawn = 0
  if (!world.trade_routes?.length && !world.caravans?.length && !world.migrations?.length) return

  const ox = world.grid.origin_x ?? 0
  const oy = world.grid.origin_y ?? 0
  caravanOrigin.x = ox
  caravanOrigin.y = oy
  const margin = 8
  const isVisible = (x: number, y: number) =>
    x >= bounds.c0 - margin && x <= bounds.c1 + margin && y >= bounds.r0 - margin && y <= bounds.r1 + margin

  // Roads lie on the ground under the towns; carts and trucks travel on top.
  if (world.lineage_eras !== tiersFor) {
    tiersFor = world.lineage_eras
    tiers = lineageEraTiers(world.lineage_eras)
  }
  const tierOf = (a: string, b: string) => Math.max(tiers.get(a) ?? 0, tiers.get(b) ?? 0)

  if (layer === 'roads') {
    routePaths.length = 0
    for (const route of world.trade_routes ?? []) {
      const path = planner.pathOf(route.id)
      if (!path) continue
      if (
        path.maxX < bounds.c0 - margin ||
        path.minX > bounds.c1 + margin ||
        path.maxY < bounds.r0 - margin ||
        path.minY > bounds.r1 + margin
      ) {
        continue
      }
      routePaths.push({ route, path })
      if (routePaths.length >= MAX_TRADE_ROUTES_2D) break
    }
    for (const { route, path } of routePaths) {
      drawTraffic(
        ctx,
        path,
        tierOf(route.lineage_a, route.lineage_b),
        TILE,
        motionTime(now),
        Math.round(route.a_center[0] * 31 + route.b_center[1]),
      )
      if (route.embargoed) {
        // A road closed by war carries a red barrier at its midpoint.
        pointAlong(path, 0.5, false, at)
        const mx = (at.x + 0.5) * TILE
        const my = (at.y + 0.5) * TILE
        ctx.fillStyle = '#7a1f1a'
        ctx.fillRect(
          Math.round(mx - TILE * 0.4),
          Math.round(my - TILE * 0.4),
          Math.round(TILE * 0.8),
          Math.round(TILE * 0.8),
        )
        ctx.fillStyle = '#e04b3a'
        ctx.fillRect(
          Math.round(mx - TILE * 0.3),
          Math.round(my - TILE * 0.3),
          Math.round(TILE * 0.6),
          Math.round(TILE * 0.6),
        )
      }
    }
    return
  }

  for (const migration of world.migrations ?? []) drawMigration(ctx, migration, ox, oy, isVisible)

  let seen = 0
  for (const caravan of world.caravans ?? []) {
    if (!isFinitePoint(caravan.from) || !isFinitePoint(caravan.to)) continue
    const duration = Math.max(1, caravan.arrives_tick - caravan.departed_tick)
    const progress = Math.max(0, Math.min(1, (world.tick - caravan.departed_tick) / duration))
    let x = caravan.from[0] + (caravan.to[0] - caravan.from[0]) * progress - ox
    let y = caravan.from[1] + (caravan.to[1] - caravan.from[1]) * progress - oy
    let angle = Math.atan2(caravan.to[1] - caravan.from[1], caravan.to[0] - caravan.from[0])
    // Walk the planned road by distance. The sim fixes when the caravan arrives, so a longer road is a faster trip.
    const route = routeOf(world.trade_routes, caravan.route_id)
    const path = route ? planner.pathOf(route.id) : null
    if (route && path) {
      // The caravan leaves from the end of the route it is nearer to.
      const toA = Math.hypot(caravan.from[0] - route.a_center[0], caravan.from[1] - route.a_center[1])
      const toB = Math.hypot(caravan.from[0] - route.b_center[0], caravan.from[1] - route.b_center[1])
      pointAlong(path, progress, toB < toA, at)
      x = at.x
      y = at.y
      angle = at.angle
    } else {
      const way = caravanWayPath(world, caravan, ox, oy)
      if (way) {
        pointAlong(way, progress, false, at)
        x = at.x
        y = at.y
        angle = at.angle
      }
    }
    if (!isVisible(x, y)) continue
    let slot = caravansInView[seen]
    if (!slot) caravansInView[seen] = slot = { caravan, x, y, angle }
    slot.caravan = caravan
    slot.x = x
    slot.y = y
    slot.angle = angle
    if (++seen >= MAX_CARAVANS_2D) break
  }
  caravansDrawn = seen
  for (let i = 0; i < seen; i++) {
    const { caravan, x, y, angle } = caravansInView[i]!
    const px = (x + 0.5) * TILE
    const py = (y + 0.5) * TILE + Math.sin(now / 170 + caravan.id * 0.73) * 0.6
    drawCaravanSprite(
      ctx,
      px,
      py,
      angle,
      tiers.get(caravan.sender_lineage) ?? 0,
      lineageColor(caravan.sender_lineage),
      TILE,
      cargoColorOf(caravan.cargo),
    )
    if (caravan.kind && caravan.kind !== 'trade') drawCaravanPennant(ctx, px, py, caravan.kind, TILE)
  }
}

const TRAIL_EVERY = 3

export function drawMigration(
  ctx: CanvasRenderingContext2D,
  migration: MigrationInfo,
  ox: number,
  oy: number,
  isVisible: (x: number, y: number) => boolean,
) {
  const color = lineageColor(migration.lineage_id)
  const path = migration.path
  const dot = Math.max(1, Math.round(TILE * 0.25))
  ctx.fillStyle = color
  for (let i = 0; i + 1 < path.length; i += 2 * TRAIL_EVERY) {
    const x = path[i]! - ox
    const y = path[i + 1]! - oy
    if (!isVisible(x, y)) continue
    ctx.fillRect(Math.round((x + 0.5) * TILE - dot / 2), Math.round((y + 0.5) * TILE - dot / 2), dot, dot)
  }
  const tx = migration.to[0] - ox
  const ty = migration.to[1] - oy
  if (!isVisible(tx, ty)) return
  const u = Math.max(1, Math.round(TILE / 5))
  const px = Math.round((tx + 0.5) * TILE)
  const py = Math.round((ty + 0.5) * TILE)
  ctx.fillStyle = '#3b2a1a'
  ctx.fillRect(px, py - u * 8, u, u * 8)
  ctx.fillStyle = color
  ctx.fillRect(px + u, py - u * 8, u * 4, u * 3)
  ctx.fillStyle = migration.cause === 'war' ? '#c8352b' : '#e9b949'
  ctx.fillRect(px + u * 2, py - u * 7, u * 2, u)
}
