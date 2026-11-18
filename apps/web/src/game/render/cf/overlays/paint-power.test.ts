import { describe, expect, it } from 'vitest'
import type { Building, WorldState } from '../../../../shared/types'
import { paintPower, powerNetwork, powerPlanOf, type PowerPlan } from './paint-power'
import type { CfFrame } from './frame'

function recorder() {
  const rects: [number, number, number, number][] = []
  let arcs = 0
  let strokes = 0
  const ctx = {
    save() {},
    restore() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    fill() {},
    stroke() {
      strokes++
    },
    arc() {
      arcs++
    },
    fillRect(x: number, y: number, w: number, h: number) {
      rects.push([x, y, w, h])
    },
  } as unknown as CanvasRenderingContext2D
  return { ctx, rects, arcs: () => arcs, strokes: () => strokes }
}

const W = 40
const H = 30

function grid(cells: [number, number][], kind = 1): number[][] {
  const roads = Array.from({ length: H }, () => new Array<number>(W).fill(0))
  for (const [c, r] of cells) roads[r][c] = kind
  return roads
}

function row(r: number, c0: number, c1: number): [number, number][] {
  const out: [number, number][] = []
  for (let c = c0; c <= c1; c++) out.push([c, r])
  return out
}

function col(c: number, r0: number, r1: number): [number, number][] {
  const out: [number, number][] = []
  for (let r = r0; r <= r1; r++) out.push([c, r])
  return out
}

const at = (id: number, kind: string, x: number, y: number, lineage = 'red', extra = {}): Building =>
  ({ id, kind, x, y, lineage_id: lineage, ...extra }) as Building

const tiers = (tier: number) => new Map([['red', tier]])

function plan(roads: number[][], buildings: Building[], tier = 5): PowerPlan {
  return powerNetwork({ roads, width: W, height: H, ox: 0, oy: 0, buildings, tiers: tiers(tier) })
}

const poleCells = (p: PowerPlan) =>
  Array.from({ length: p.poles.length / 2 }, (_, i) => [p.poles[2 * i], p.poles[2 * i + 1]])

function wirePairs(p: PowerPlan) {
  const cells = poleCells(p)
  const out: [number[], number[]][] = []
  for (let i = 0; i < p.wires.length; i += 2) out.push([cells[p.wires[i]], cells[p.wires[i + 1]]])
  return out
}

describe('power network', () => {
  const street = grid(row(5, 0, 30))
  const town = [at(1, 'power_plant', 0, 1), at(2, 'house', 10, 6), at(3, 'factory', 20, 6)]

  it('strings the poles along the road from the plant to each building', () => {
    const p = plan(street, town)
    const cells = poleCells(p)
    expect(cells.length).toBeGreaterThan(2)
    for (const [, r] of cells) expect(r).toBe(5)
    for (const [a, b] of wirePairs(p)) {
      expect(a[1]).toBe(b[1])
      expect(Math.abs(a[0] - b[0])).toBeLessThanOrEqual(4)
    }
    expect(p.drops.length / 3).toBe(3)
    const dropRows = []
    for (let i = 0; i < p.drops.length; i += 3) dropRows.push(p.drops[i + 2])
    expect(dropRows.sort()).toEqual([4, 6, 6])
  })

  it('runs no line past the last building', () => {
    const p = plan(street, town)
    const furthest = Math.max(...poleCells(p).map(([c]) => c))
    expect(furthest).toBeLessThanOrEqual(25)
  })

  it('puts a pole on every turn so wires never cut a corner', () => {
    const roads = grid([...row(5, 0, 12), ...col(12, 5, 20)])
    const p = plan(roads, [at(1, 'power_plant', 0, 1), at(2, 'house', 13, 18)])
    expect(poleCells(p)).toContainEqual([12, 5])
    for (const [a, b] of wirePairs(p)) expect(a[0] === b[0] || a[1] === b[1]).toBe(true)
  })

  it('follows rail and bridges as well as roads', () => {
    const roads = grid(row(5, 0, 30), 3)
    roads[5][15] = 2
    const p = plan(roads, town)
    expect(p.drops.length / 3).toBe(3)
  })

  it('leaves a building with no road in reach unwired, with no line across the fields', () => {
    const p = plan(street, [...town, at(4, 'house', 30, 20)])
    expect(p.drops.length / 3).toBe(3)
    for (const [, r] of poleCells(p)) expect(r).toBe(5)
  })

  it('wires nothing without a finished generator or before the industrial age', () => {
    const houses = town.filter((b) => b.kind !== 'power_plant')
    expect(plan(street, houses).poles).toEqual([])
    expect(
      plan(street, [at(1, 'power_plant', 0, 1, 'red', { construction_progress: 0.5 }), ...houses]).poles,
    ).toEqual([])
    expect(plan(street, [at(1, 'power_plant', 0, 1, 'red', { ruined: true }), ...houses]).poles).toEqual([])
    expect(plan(street, town, 4).poles).toEqual([])
  })

  it('powers only the tribes that own a generator', () => {
    const p = plan(street, [...town.slice(0, 1), at(5, 'house', 10, 6, 'blue')])
    expect(p.drops.length / 3).toBe(1)
  })

  it('skips props that draw no power', () => {
    const p = plan(street, [town[0], at(6, 'fence', 10, 6), at(7, 'gravestone', 12, 6)])
    expect(p.drops.length / 3).toBe(1)
  })

  it('is the same whatever order the buildings come in', () => {
    const a = plan(street, town)
    const b = plan(street, [...town].reverse())
    expect(b).toEqual(a)
    expect(plan(street, town)).toEqual(a)
  })

  it('measures cells from the grid origin', () => {
    const shifted = town.map((b) => ({ ...b, x: b.x + 100, y: b.y + 50 }))
    const p = powerNetwork({
      roads: street,
      width: W,
      height: H,
      ox: 100,
      oy: 50,
      buildings: shifted,
      tiers: tiers(5),
    })
    expect(p).toEqual(plan(street, town))
  })
})

function world(roads: number[][], buildings: Building[], isDay: boolean, revision = 1): WorldState {
  return {
    buildings,
    lineage_eras: { red: 'industrial' },
    is_day: isDay,
    grid: { width: W, height: H, origin_x: 0, origin_y: 0, roads, road_revision: revision },
  } as unknown as WorldState
}

function frame(w: WorldState): CfFrame {
  return { world: w, ox: 0, oy: 0, bounds: { c0: 0, c1: 200, r0: 0, r1: 200 } } as unknown as CfFrame
}

describe('power plan cache', () => {
  it('rebuilds only when the roads or the finished buildings change', () => {
    const roads = grid(row(5, 0, 30))
    const buildings = [at(1, 'power_plant', 0, 1), at(2, 'house', 10, 6)]
    const first = powerPlanOf(world(roads, buildings, true))
    expect(powerPlanOf(world(roads, [...buildings], true))).toBe(first)
    const building = [...buildings, at(3, 'house', 20, 6, 'red', { construction_progress: 0.3 })]
    expect(powerPlanOf(world(roads, building, true))).toBe(first)
    const built = [...buildings, at(3, 'house', 20, 6)]
    expect(powerPlanOf(world(roads, built, true))).not.toBe(first)
    const again = powerPlanOf(world(roads, built, true))
    expect(powerPlanOf(world(roads, built, true, 2))).not.toBe(again)
  })

  it('rebuilds when a building changes hands', () => {
    const roads = grid(row(5, 0, 30))
    const unowned = [at(1, 'power_plant', 0, 1, ''), at(2, 'house', 10, 6)]
    const before = powerPlanOf(world(roads, unowned, true))
    expect(before.poles).toEqual([])
    const owned = [at(1, 'power_plant', 0, 1), at(2, 'house', 10, 6)]
    expect(powerPlanOf(world(roads, owned, true)).poles.length).toBeGreaterThan(0)
  })
})

describe('power poles', () => {
  const roads = grid(row(5, 0, 30))
  const buildings = [at(1, 'power_plant', 0, 1), at(2, 'house', 10, 6), at(3, 'factory', 20, 6)]

  it('draw a post and crossbar per pole and all the wires in one stroke', () => {
    const w = world(roads, buildings, true)
    const poles = powerPlanOf(w).poles.length / 2
    const rec = recorder()
    paintPower(rec.ctx, frame(w))
    expect(rec.rects.length).toBe(poles * 2)
    expect(rec.strokes()).toBe(1)
    expect(rec.arcs()).toBe(0)
  })

  it('light a lamp on each pole at night only', () => {
    const w = world(roads, buildings, false)
    const poles = powerPlanOf(w).poles.length / 2
    const rec = recorder()
    paintPower(rec.ctx, frame(w))
    expect(rec.arcs()).toBe(poles)
  })

  it('draw nothing without roads', () => {
    const w = { ...world(roads, buildings, true), grid: { width: W, height: H } } as unknown as WorldState
    const rec = recorder()
    paintPower(rec.ctx, frame(w))
    expect(rec.rects.length + rec.strokes()).toBe(0)
  })
})
