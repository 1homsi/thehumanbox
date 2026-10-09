import { lineageEraTiers } from '../draw-helpers'
import type { WorldState } from '../../../shared/types'
import { lineageColor } from '../../../shared/constants'
import { drawCaravanSprite, drawRoad, drawTraffic } from '../roads'
import { motionTime } from '../../../shared/motion'
import { TILE } from '../../model/palette'
import { cargoColorOf } from '../../model/cargo'

export const MAX_TRADE_ROUTES_2D = 48
export const MAX_CARAVANS_2D = 64

export function isFinitePoint(point: [number, number]): boolean {
  return Number.isFinite(point[0]) && Number.isFinite(point[1])
}

export function drawTradeNetwork2D(
  ctx: CanvasRenderingContext2D,
  world: WorldState,
  bounds: { c0: number; c1: number; r0: number; r1: number },
  now: number,
  layer: 'roads' | 'caravans',
) {
  if (!world.trade_routes?.length && !world.caravans?.length) return

  const ox = world.grid.origin_x ?? 0
  const oy = world.grid.origin_y ?? 0
  const margin = 8
  const isVisible = (x: number, y: number) =>
    x >= bounds.c0 - margin && x <= bounds.c1 + margin && y >= bounds.r0 - margin && y <= bounds.r1 + margin

  const visibleRoutes: NonNullable<WorldState['trade_routes']> = []
  for (const route of world.trade_routes ?? []) {
    if (!isFinitePoint(route.a_center) || !isFinitePoint(route.b_center)) continue
    const ax = route.a_center[0] - ox
    const ay = route.a_center[1] - oy
    const bx = route.b_center[0] - ox
    const by = route.b_center[1] - oy
    if (
      Math.max(ax, bx) < bounds.c0 - margin ||
      Math.min(ax, bx) > bounds.c1 + margin ||
      Math.max(ay, by) < bounds.r0 - margin ||
      Math.min(ay, by) > bounds.r1 + margin
    ) {
      continue
    }
    visibleRoutes.push(route)
    if (visibleRoutes.length >= MAX_TRADE_ROUTES_2D) break
  }

  type VisibleCaravan = {
    caravan: NonNullable<WorldState['caravans']>[number]
    localX: number
    localY: number
  }
  const visibleCaravans: VisibleCaravan[] = []
  for (const caravan of world.caravans ?? []) {
    if (!isFinitePoint(caravan.from) || !isFinitePoint(caravan.to)) continue
    const duration = Math.max(1, caravan.arrives_tick - caravan.departed_tick)
    const progress = Math.max(0, Math.min(1, (world.tick - caravan.departed_tick) / duration))
    const localX = caravan.from[0] + (caravan.to[0] - caravan.from[0]) * progress - ox
    const localY = caravan.from[1] + (caravan.to[1] - caravan.from[1]) * progress - oy
    if (!isVisible(localX, localY)) continue
    visibleCaravans.push({ caravan, localX, localY })
    if (visibleCaravans.length >= MAX_CARAVANS_2D) break
  }

  if (visibleRoutes.length === 0 && visibleCaravans.length === 0) return

  // Roads lie on the ground under the towns; carts and trucks travel on top.
  const tiers = lineageEraTiers(world.lineage_eras)
  const tierOf = (a: string, b: string) => Math.max(tiers.get(a) ?? 0, tiers.get(b) ?? 0)
  if (layer === 'roads') {
    for (const route of visibleRoutes) {
      const startX = (route.a_center[0] - ox + 0.5) * TILE
      const startY = (route.a_center[1] - oy + 0.5) * TILE
      const endX = (route.b_center[0] - ox + 0.5) * TILE
      const endY = (route.b_center[1] - oy + 0.5) * TILE
      const tier = tierOf(route.lineage_a, route.lineage_b)
      drawRoad(ctx, startX, startY, endX, endY, tier, TILE)
      drawTraffic(
        ctx,
        startX,
        startY,
        endX,
        endY,
        tier,
        TILE,
        motionTime(now),
        Math.round(route.a_center[0] * 31 + route.b_center[1]),
      )
      if (route.embargoed) {
        // A road closed by war carries a red barrier at its midpoint.
        const mx = (startX + endX) / 2
        const my = (startY + endY) / 2
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
  for (const { caravan, localX, localY } of visibleCaravans) {
    const px = (localX + 0.5) * TILE
    const py = (localY + 0.5) * TILE + Math.sin(now / 170 + caravan.id * 0.73) * 0.6
    const angle = Math.atan2(caravan.to[1] - caravan.from[1], caravan.to[0] - caravan.from[0])
    const tier = tiers.get(caravan.sender_lineage) ?? 0
    drawCaravanSprite(
      ctx,
      px,
      py,
      angle,
      tier,
      lineageColor(caravan.sender_lineage),
      TILE,
      cargoColorOf(caravan.cargo),
    )
  }
}
