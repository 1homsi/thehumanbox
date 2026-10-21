import { describe, expect, it } from 'vitest'
import type { WorldState } from '../../../shared/types'
import { TILE } from '../../model/palette'
import { buildPath, type TradePathPlanner } from '../trade-paths'
import { drawTradeNetwork2D } from './trade-network'

interface Call {
  op: string
  args: number[]
  fill: string
}

/** A canvas context that records the calls the network makes. */
function recorder() {
  const calls: Call[] = []
  let fill = ''
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (t, key: string) => {
      if (key === 'fillStyle') return fill
      if (key in t) return t[key]
      return (...args: number[]) => calls.push({ op: key, args, fill })
    },
    set: (t, key: string, value) => {
      if (key === 'fillStyle') fill = value as string
      else t[key] = value
      return true
    },
  }) as unknown as CanvasRenderingContext2D
  return { ctx, calls }
}

// East from (2,2) to (12,2), then south to (12,12): 20 tiles, with a corner at (12,2).
const cells = Int32Array.from([
  ...Array.from({ length: 11 }, (_, i) => 2 * 20 + 2 + i),
  ...Array.from({ length: 10 }, (_, i) => (3 + i) * 20 + 12),
])
const path = buildPath(cells, 20, [2, 2], [12, 12])
const planner = { pathOf: (id: number) => (id === 1 ? path : null) } as unknown as TradePathPlanner

const bounds = { c0: 0, c1: 20, r0: 0, r1: 20 }

function world(over: Partial<WorldState> = {}): WorldState {
  return {
    grid: { width: 20, height: 20, origin_x: 0, origin_y: 0 },
    tick: 150,
    trade_routes: [
      {
        id: 1,
        lineage_a: 'a',
        lineage_b: 'b',
        a_center: [2, 2],
        b_center: [12, 12],
        established_tick: 0,
        last_dispatch_tick: 0,
        deliveries: 0,
        volume: 0,
      },
    ],
    caravans: [
      {
        id: 7,
        route_id: 1,
        sender_lineage: 'a',
        receiver_lineage: 'b',
        sender_org_id: 'o',
        cargo: 'food',
        amount: 1,
        unit_price: 1,
        departed_tick: 100,
        arrives_tick: 200,
        from: [2, 2],
        to: [12, 12],
      },
    ],
    lineage_eras: [
      { lineage_id: 'a', era_name: 'stone' },
      { lineage_id: 'b', era_name: 'stone' },
    ],
    ...over,
  } as unknown as WorldState
}

/** Where the caravan sprite was placed, in tiles. */
function caravanTile(calls: Call[]) {
  const move = calls.find((c) => c.op === 'translate')!
  return [move.args[0]! / TILE - 0.5, move.args[1]! / TILE - 0.5]
}

describe('caravans on a planned road', () => {
  it('follow the road by distance, not the straight line between the towns', () => {
    const { ctx, calls } = recorder()
    // Halfway through the trip: ten tiles along the 20-tile road, which is the corner.
    drawTradeNetwork2D(ctx, world({ tick: 150 }), bounds, 0, 'caravans', planner)
    const [x, y] = caravanTile(calls)
    expect(Math.abs(x! - 12)).toBeLessThan(0.5)
    expect(Math.abs(y! - 2)).toBeLessThan(0.5)
    // The straight line would have put it at (7, 7).
    expect(Math.hypot(x! - 7, y! - 7)).toBeGreaterThan(5)
  })

  it('stay on the road all the way: every position is on the first leg or the second', () => {
    for (let tick = 100; tick <= 200; tick += 7) {
      const { ctx, calls } = recorder()
      drawTradeNetwork2D(ctx, world({ tick }), bounds, 0, 'caravans', planner)
      const [x, y] = caravanTile(calls)
      const onFirstLeg = Math.abs(y! - 2) < 0.51 && x! > 1.5 && x! < 12.5
      const onSecondLeg = Math.abs(x! - 12) < 0.51 && y! > 1.5 && y! < 12.5
      expect(onFirstLeg || onSecondLeg).toBe(true)
    }
  })

  it('keep the sim timing: at the start and the end they are at the road ends', () => {
    const start = recorder()
    drawTradeNetwork2D(start.ctx, world({ tick: 100 }), bounds, 0, 'caravans', planner)
    expect(caravanTile(start.calls).map(Math.round)).toEqual([2, 2])
    const end = recorder()
    drawTradeNetwork2D(end.ctx, world({ tick: 200 }), bounds, 0, 'caravans', planner)
    expect(caravanTile(end.calls).map(Math.round)).toEqual([12, 12])
  })

  it('walk the road back when they leave from the far end', () => {
    const w = world({ tick: 125 })
    w.caravans![0] = { ...w.caravans![0]!, from: [12, 12], to: [2, 2] }
    const { ctx, calls } = recorder()
    drawTradeNetwork2D(ctx, w, bounds, 0, 'caravans', planner)
    const [x, y] = caravanTile(calls)
    // A quarter of the way back: five tiles up the second leg.
    expect(Math.abs(x! - 12)).toBeLessThan(0.5)
    expect(Math.abs(y! - 7)).toBeLessThan(0.5)
  })

  it('move in a straight line when the route has no planned road', () => {
    const { ctx, calls } = recorder()
    const none = { pathOf: () => null } as unknown as TradePathPlanner
    drawTradeNetwork2D(ctx, world({ tick: 150 }), bounds, 0, 'caravans', none)
    const [x, y] = caravanTile(calls)
    expect(x).toBeCloseTo(7, 0)
    expect(y).toBeCloseTo(7, 0)
  })

  it('are drawn only on the caravans layer, and skipped when out of view', () => {
    const roadsLayer = recorder()
    drawTradeNetwork2D(roadsLayer.ctx, world(), bounds, 0, 'roads', planner)
    expect(roadsLayer.calls.some((c) => c.op === 'translate')).toBe(false)
    const far = recorder()
    drawTradeNetwork2D(far.ctx, world(), { c0: 100, c1: 120, r0: 100, r1: 120 }, 0, 'caravans', planner)
    expect(far.calls).toHaveLength(0)
  })
})

describe('traffic and barriers on a planned road', () => {
  const modern = [
    { lineage_id: 'a', era_name: 'modern' },
    { lineage_id: 'b', era_name: 'modern' },
  ]
  const CAR_COLORS = ['#c8392b', '#2f4f8a', '#e9e4d8', '#3f7a3a', '#d9a23a']

  it('puts cars of the modern ages on the road tiles, and none in the early ages', () => {
    const { ctx, calls } = recorder()
    drawTradeNetwork2D(ctx, world({ lineage_eras: modern }), bounds, 5000, 'roads', planner)
    const cars = calls.filter((c) => c.op === 'fillRect' && CAR_COLORS.includes(c.fill))
    expect(cars.length).toBeGreaterThan(0)
    const onRoad = new Set<string>()
    for (const i of cells) onRoad.add(`${i % 20},${Math.floor(i / 20)}`)
    for (const car of cars) {
      const cx = Math.floor((car.args[0]! + car.args[2]! / 2) / TILE)
      const cy = Math.floor((car.args[1]! + car.args[3]! / 2) / TILE)
      expect(onRoad.has(`${cx},${cy}`)).toBe(true)
    }
    const early = recorder()
    drawTradeNetwork2D(early.ctx, world(), bounds, 5000, 'roads', planner)
    expect(early.calls.filter((c) => CAR_COLORS.includes(c.fill))).toHaveLength(0)
  })

  it('puts the red barrier of an embargoed route at the middle of the road', () => {
    const w = world()
    w.trade_routes![0] = { ...w.trade_routes![0]!, embargoed: true }
    const { ctx, calls } = recorder()
    drawTradeNetwork2D(ctx, w, bounds, 0, 'roads', planner)
    const barrier = calls.find((c) => c.fill === '#7a1f1a')!
    // Ten tiles along a road with its corner at (12, 2).
    const x = (barrier.args[0]! + barrier.args[2]! / 2) / TILE - 0.5
    const y = (barrier.args[1]! + barrier.args[3]! / 2) / TILE - 0.5
    expect(Math.abs(x - 12)).toBeLessThan(0.6)
    expect(Math.abs(y - 2)).toBeLessThan(0.6)
  })

  it('draws no road of its own: the road layer does that', () => {
    const { ctx, calls } = recorder()
    drawTradeNetwork2D(ctx, world(), bounds, 0, 'roads', planner)
    expect(calls.filter((c) => c.op === 'rotate' || c.op === 'translate')).toHaveLength(0)
  })

  it('draws nothing for a route with no planned road', () => {
    const { ctx, calls } = recorder()
    drawTradeNetwork2D(ctx, world({ lineage_eras: modern }), bounds, 0, 'roads', {
      pathOf: () => null,
    } as unknown as TradePathPlanner)
    expect(calls).toHaveLength(0)
  })
})
