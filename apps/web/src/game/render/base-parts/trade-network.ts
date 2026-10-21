import { lineageEraTiers } from '../draw-helpers'
import type { CaravanInfo, TradeRouteInfo, WorldState } from '../../../shared/types'
import { lineageColor } from '../../../shared/constants'
import { drawCaravanSprite, drawTraffic } from '../roads'
import {
  pointAlong,
  tradePaths,
  type PathPoint,
  type PlannedPath,
  type TradePathPlanner,
} from '../trade-paths'
import { motionTime } from '../../../shared/motion'
import { TILE } from '../../model/palette'
import { cargoColorOf } from '../../model/cargo'

export const MAX_TRADE_ROUTES_2D = 48
export const MAX_CARAVANS_2D = 64

export function isFinitePoint(point: [number, number]): boolean {
  return Number.isFinite(point[0]) && Number.isFinite(point[1])
}

function routeOf(routes: TradeRouteInfo[] | undefined, id: number): TradeRouteInfo | undefined {
  if (!routes) return undefined
  for (let i = 0; i < routes.length; i++) if (routes[i]!.id === id) return routes[i]
  return undefined
}

/** Reused every call, so drawing the network allocates nothing per frame. */
const at: PathPoint = { x: 0, y: 0, angle: 0 }
const routePaths: { route: TradeRouteInfo; path: PlannedPath }[] = []
const caravansInView: { caravan: CaravanInfo; x: number; y: number; angle: number }[] = []
let tiersFor: WorldState['lineage_eras']
let tiers = new Map<string, number>()

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
  if (!world.trade_routes?.length && !world.caravans?.length) return

  const ox = world.grid.origin_x ?? 0
  const oy = world.grid.origin_y ?? 0
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
  }
}
