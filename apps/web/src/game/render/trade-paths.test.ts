import { describe, expect, it } from 'vitest'
import type { WorldState } from '../../shared/types'
import { TILE_ID } from '../model/terrain-ids'
import { ROAD_BRIDGE, ROAD_CANAL, ROAD_RAIL, ROAD_TRACK } from './cf/roads/road-art'
import {
  MAX_SPAN,
  PLAN_BUDGET,
  PLAN_PAD,
  PLANNED_BRIDGE,
  TradePathPlanner,
  buildPath,
  planPath,
  planRoute,
  pointAlong,
  styleCodeOf,
  type PathPoint,
  type PlanGrid,
} from './trade-paths'

/**
 * A grid from a map of rows: `.` grass, `~` water, `^` rock, `h` hut, `#` a building, `+` a road,
 * `|` a railway, `c` a canal.
 */
function land(rows: string[]): PlanGrid {
  const height = rows.length
  const width = rows[0]!.length
  const blocked = new Uint8Array(width * height)
  const tiles = rows.map((row, y) =>
    [...row].map((ch, x) => {
      if (ch === '#') blocked[y * width + x] = 1
      return ch === '~' ? TILE_ID.WATER : ch === '^' ? TILE_ID.ROCK : ch === 'h' ? TILE_ID.HUT : TILE_ID.GRASS
    }),
  )
  const roads = rows.map((row) =>
    [...row].map((ch) =>
      ch === '+'
        ? ROAD_TRACK
        : ch === '|'
          ? ROAD_RAIL
          : ch === 'c'
            ? ROAD_CANAL
            : ch === 'B'
              ? ROAD_BRIDGE
              : 0,
    ),
  )
  return { width, height, tiles, roads, blocked }
}

const cellsOf = (grid: PlanGrid, path: Int32Array) =>
  [...path].map((i) => [i % grid.width, Math.floor(i / grid.width)] as const)

/** The way is one unbroken four-way walk. */
function expectContiguous(grid: PlanGrid, path: Int32Array) {
  const cells = cellsOf(grid, path)
  for (let i = 1; i < cells.length; i++) {
    const [ax, ay] = cells[i - 1]!
    const [bx, by] = cells[i]!
    expect(Math.abs(ax - bx) + Math.abs(ay - by)).toBe(1)
  }
}

describe('planning a route over the land', () => {
  it('runs straight over open ground, from the edge of one centre to the edge of the other', () => {
    const grid = land(['................', '................', '................'])
    const path = planPath(grid, [1, 1], [14, 1])!
    expectContiguous(grid, path)
    const cells = cellsOf(grid, path)
    expect(cells.every(([, y]) => y === 1)).toBe(true)
    // It starts and ends within reach of the centres, which are usually built over.
    expect(cells[0]![0]).toBeLessThanOrEqual(5)
    expect(cells.at(-1)![0]).toBeGreaterThanOrEqual(10)
  })

  it('goes round a lake', () => {
    const grid = land([
      '....................',
      '.........~~.........',
      '.........~~.........',
      '.........~~.........',
      '.........~~.........',
      '....................',
    ])
    const path = planPath(grid, [1, 3], [18, 3], false, undefined, 6)!
    expectContiguous(grid, path)
    for (const [x, y] of cellsOf(grid, path)) expect(grid.tiles[y]![x]).not.toBe(TILE_ID.WATER)
    // Past the lake, over the top or round the bottom.
    expect(cellsOf(grid, path).some(([, y]) => y === 0 || y === 5)).toBe(true)
  })

  it('goes round rock and round buildings', () => {
    const grid = land([
      '....................',
      '.........^^.........',
      '.........^^.........',
      '.........##.........',
      '.........##.........',
      '....................',
    ])
    const path = planPath(grid, [1, 3], [18, 3], false, undefined, 6)!
    expectContiguous(grid, path)
    for (const [x, y] of cellsOf(grid, path)) {
      expect(grid.tiles[y]![x]).not.toBe(TILE_ID.ROCK)
      expect(grid.blocked![y * grid.width + x]).toBe(0)
    }
  })

  it('keeps off huts too, and starts outside a centre ringed by them', () => {
    const grid = land([
      '.................',
      '.................',
      '.....hhhhh.......',
      '.....h...h.......',
      '.....h...h.......',
      '.....hhhhh.......',
      '.................',
    ])
    // The centre stands inside a ring of huts; the road still starts, outside it.
    const path = planPath(grid, [8, 3], [16, 3])!
    expect(path).not.toBeNull()
    for (const [x, y] of cellsOf(grid, path)) expect(grid.tiles[y]![x]).not.toBe(TILE_ID.HUT)
  })

  it('prefers the roads already laid', () => {
    const grid = land([
      '....................................',
      '++++++++++++++++++++++++++++++++++++',
      '....................................',
      '....................................',
      '....................................',
    ])
    const path = planPath(grid, [0, 3], [35, 3])!
    const onRoad = cellsOf(grid, path).filter(([x, y]) => grid.roads![y]![x] === ROAD_TRACK).length
    expect(onRoad).toBeGreaterThan(20)
  })

  it('follows a route already planned, so routes join into one road', () => {
    const rows = Array.from({ length: 7 }, () => '.'.repeat(36))
    const grid = land(rows)
    const planned = new Uint8Array(grid.width * grid.height)
    for (let x = 0; x < 36; x++) planned[1 * grid.width + x] = 1
    const path = planPath({ ...grid, planned }, [0, 5], [35, 5])!
    const shared = cellsOf(grid, path).filter(([, y]) => y === 1).length
    expect(shared).toBeGreaterThan(20)
  })

  it('gives up when the search outgrows its budget, and when the centre is walled in', () => {
    const open = land(Array.from({ length: 40 }, () => '.'.repeat(80)))
    expect(planPath(open, [2, 20], [77, 20], false, 30)).toBeNull()
    expect(planPath(open, [2, 20], [77, 20], false, 20_000)).not.toBeNull()
    const walled = land(['..........', '.^^^^^^^^.', '.^......^.', '.^......^.', '.^^^^^^^^.', '..........'])
    expect(planPath(walled, [4, 3], [9, 5], false, undefined, undefined, 1)).toBeNull()
  })

  it('searches only a padded box round the two centres', () => {
    // A tall wall between the centres: the way round needs rows far above or below them.
    const rows = Array.from({ length: 20 }, (_, y) =>
      y >= 2 && y <= 17 ? '........^^........' : '.................',
    )
    const grid = land(rows)
    expect(planPath(grid, [2, 10], [15, 10], false, undefined, 7)).toBeNull()
    expect(planPath(grid, [2, 10], [15, 10], false, undefined, 8)).not.toBeNull()
  })

  it('bridges narrow water when there is no dry way, and not wide water', () => {
    const river = (width: number) =>
      land(Array.from({ length: 5 }, () => '.'.repeat(8) + '~'.repeat(width) + '.'.repeat(8)))
    const narrow = river(3)
    expect(planPath(narrow, [2, 2], [18, 2])).toBeNull()
    const path = planRoute(narrow, [2, 2], [18, 2])!
    expectContiguous(narrow, path)
    expect(cellsOf(narrow, path).filter(([x, y]) => narrow.tiles[y]![x] === TILE_ID.WATER)).toHaveLength(3)

    const wide = river(MAX_SPAN + 2)
    expect(planRoute(wide, [2, 2], [8 + MAX_SPAN + 2 + 6, 2])).toBeNull()
  })

  it('walks over the bridges already built', () => {
    const grid = land(['....~~~~....', '....BBBB....', '....~~~~....'])
    // Only the bridge row is a way across, and the dry plan finds it.
    const path = planPath(grid, [0, 1], [11, 1])!
    expect(cellsOf(grid, path).filter(([x, y]) => grid.roads![y]![x] === ROAD_BRIDGE)).toHaveLength(4)
  })

  it('crosses a railway or a canal when it must, once', () => {
    const grid = land(Array.from({ length: 5 }, () => '.'.repeat(8) + '|' + '.'.repeat(8)))
    const path = planPath(grid, [1, 2], [16, 2])!
    expect(cellsOf(grid, path).filter(([x, y]) => grid.roads![y]![x] === ROAD_RAIL)).toHaveLength(1)
    const canal = land(Array.from({ length: 5 }, () => '.'.repeat(8) + 'c' + '.'.repeat(8)))
    expect(planPath(canal, [1, 2], [16, 2])).not.toBeNull()
  })

  it('finds nothing when the ground is not there', () => {
    const grid = land(['~~~~~~~~', '~~~~~~~~', '~~~~~~~~'])
    expect(planRoute(grid, [1, 1], [6, 1])).toBeNull()
  })
})

describe('bridges and carts', () => {
  it('a bridge crosses a strait straight, square to it, and lands on the far bank', () => {
    // A strait four tiles wide, between two banks; the towns sit across it at a slant.
    const rows = Array.from({ length: 12 }, () => '......~~~~......')
    const grid = land(rows)
    const path = planRoute(grid, [2, 2], [13, 9])!
    expect(path).not.toBeNull()
    const wet = Array.from(path).filter(
      (i) => grid.tiles[Math.floor(i / grid.width)]![i % grid.width] === TILE_ID.WATER,
    )
    expect(wet.length).toBe(4)
    const row = Math.floor(wet[0]! / grid.width)
    expect(wet.every((i) => Math.floor(i / grid.width) === row)).toBe(true)
  })

  it('a straight crossing is still found when a cheaper way reaches the water from the side', () => {
    // From the west the water at (2,1) faces a rock; only the span from (2,0) south over (2,1) and (2,2) lands.
    const grid = land(['.....', '..~^.', '^^~^^', '.....'])
    const path = planPath(grid, [0, 1], [2, 3], true, PLAN_BUDGET, PLAN_PAD, 0)
    expect(path).not.toBeNull()
    const cells = Array.from(path!).map((i) => [i % grid.width, Math.floor(i / grid.width)])
    const wet = cells.filter(([x, y]) => grid.tiles[y]![x] === TILE_ID.WATER)
    expect(wet).toEqual([
      [2, 1],
      [2, 2],
    ])
  })

  it('towns side by side, with a single road tile between them, still give their caravans a way to travel', () => {
    const path = buildPath(Int32Array.from([3 * 10 + 4]), 10, [2, 3], [6, 3])
    expect(path.total).toBe(4)
    expect(Array.from(path.xs)).toEqual([2, 4, 6])
  })

  it('a bridge span stops at a building standing in the water', () => {
    // Rock walls the water on both sides, so the only crossing is the column of water, and a pier blocks it.
    const grid = land(['^..^', '^~^^', '^~^^', '^..^'])
    grid.blocked = new Uint8Array(grid.width * grid.height)
    grid.blocked[2 * grid.width + 1] = 1
    expect(planPath(grid, [1, 0], [1, 3], true, PLAN_BUDGET, PLAN_PAD, 0)).toBeNull()
  })

  it('carts keep to the road tiles, not the straight leg from a centre that lies off the road', () => {
    // The road runs along row 3; the town centres sit two rows above it, over water.
    const cells = Int32Array.from([3 * 10 + 1, 3 * 10 + 2, 3 * 10 + 3, 3 * 10 + 4])
    const path = buildPath(cells, 10, [1, 1], [4, 1])
    expect(Array.from(path.ys)).toEqual([3, 3, 3, 3])
    expect(path.total).toBe(3)
  })
})

describe('walking a planned path', () => {
  // East from (0,0) to (4,0), then south to (4,4): 8 tiles long, with a corner.
  const cells = Int32Array.from([0, 1, 2, 3, 4, 9, 14, 19, 24])
  const path = buildPath(cells, 5, [0, 0], [4, 4])

  it('reads the point a share of the way along by distance, and its heading', () => {
    const out: PathPoint = { x: 0, y: 0, angle: 0 }
    expect(path.total).toBe(8)
    pointAlong(path, 0, false, out)
    expect([out.x, out.y]).toEqual([0, 0])
    pointAlong(path, 1, false, out)
    expect([out.x, out.y]).toEqual([4, 4])
    // A quarter of the way is two tiles along the first leg, heading east.
    pointAlong(path, 0.25, false, out)
    expect([out.x, out.y]).toEqual([2, 0])
    expect(out.angle).toBeCloseTo(0)
    // Three quarters is two tiles down the second leg, heading south.
    pointAlong(path, 0.75, false, out)
    expect([out.x, out.y]).toEqual([4, 2])
    expect(out.angle).toBeCloseTo(Math.PI / 2)
    // Round the corner it stays on the road, never cutting the diagonal.
    pointAlong(path, 0.5, false, out)
    expect([out.x, out.y]).toEqual([4, 0])
  })

  it('walks it from the other end in reverse, facing back', () => {
    const fwd: PathPoint = { x: 0, y: 0, angle: 0 }
    const back: PathPoint = { x: 0, y: 0, angle: 0 }
    pointAlong(path, 0.3, false, fwd)
    pointAlong(path, 0.7, true, back)
    expect(back.x).toBeCloseTo(fwd.x)
    expect(back.y).toBeCloseTo(fwd.y)
    expect(Math.cos(back.angle)).toBeCloseTo(-Math.cos(fwd.angle))
    expect(Math.sin(back.angle)).toBeCloseTo(-Math.sin(fwd.angle))
  })

  it('covers equal distances in equal shares, and clamps outside 0 to 1', () => {
    const a: PathPoint = { x: 0, y: 0, angle: 0 }
    const b: PathPoint = { x: 0, y: 0, angle: 0 }
    pointAlong(path, 0.125, false, a)
    pointAlong(path, 0.25, false, b)
    expect(Math.abs(b.x - a.x) + Math.abs(b.y - a.y)).toBeCloseTo(1)
    pointAlong(path, 0.625, false, a)
    pointAlong(path, 0.75, false, b)
    expect(Math.abs(b.x - a.x) + Math.abs(b.y - a.y)).toBeCloseTo(1)
    pointAlong(path, -3, false, a)
    expect([a.x, a.y]).toEqual([0, 0])
    pointAlong(path, 9, false, a)
    expect([a.x, a.y]).toEqual([4, 4])
  })

  it('does not allocate: it writes into the point it is given', () => {
    const out: PathPoint = { x: 0, y: 0, angle: 0 }
    expect(pointAlong(path, 0.4, false, out)).toBe(out)
  })
})

interface RouteSpec {
  id: number
  a: [number, number]
  b: [number, number]
  lineages?: [string, string]
}

function worldWith(
  grid: PlanGrid,
  routes: RouteSpec[],
  extra: Partial<WorldState> = {},
  origin: [number, number] = [0, 0],
): WorldState {
  return {
    grid: {
      width: grid.width,
      height: grid.height,
      origin_x: origin[0],
      origin_y: origin[1],
      tiles: grid.tiles as number[][],
      roads: grid.roads as number[][],
    },
    trade_routes: routes.map((r) => ({
      id: r.id,
      lineage_a: r.lineages?.[0] ?? 'a',
      lineage_b: r.lineages?.[1] ?? 'b',
      a_center: [r.a[0] + origin[0], r.a[1] + origin[1]],
      b_center: [r.b[0] + origin[0], r.b[1] + origin[1]],
      established_tick: 0,
      last_dispatch_tick: 0,
      deliveries: 0,
      volume: 0,
    })),
    buildings: [],
    lineage_eras: [
      { lineage_id: 'a', era_name: 'stone' },
      { lineage_id: 'b', era_name: 'stone' },
    ],
    ...extra,
  } as unknown as WorldState
}

const open = (w: number, h: number) => land(Array.from({ length: h }, () => '.'.repeat(w)))

describe('TradePathPlanner', () => {
  it('waits for the terrain, then plans a few routes per update so a big world does not hitch', () => {
    const grid = open(60, 40)
    const routes = Array.from({ length: 8 }, (_, i) => ({
      id: i + 1,
      a: [2, 2 + i * 4] as [number, number],
      b: [50, 2 + i * 4] as [number, number],
    }))
    const world = worldWith(grid, routes)
    const planner = new TradePathPlanner()
    expect(planner.update(world, 0)).toBe(false)
    expect(planner.stats.planned).toBe(0)
    expect(planner.update(world, 1)).toBe(true)
    expect(planner.stats.planned).toBeGreaterThan(0)
    expect(planner.stats.planned).toBeLessThan(8)
    expect(planner.settled).toBe(false)
    let updates = 1
    while (!planner.settled && updates < 20) {
      planner.update(world, 1)
      updates++
    }
    expect(planner.settled).toBe(true)
    expect(updates).toBeGreaterThanOrEqual(3)
    expect(planner.stats.planned).toBe(8)
    for (const r of routes) expect(planner.pathOf(r.id)).not.toBeNull()
  })

  it('plans a route once, and only the new route when one is added', () => {
    const grid = open(60, 30)
    const world = worldWith(grid, [{ id: 1, a: [2, 5], b: [50, 5] }])
    const planner = new TradePathPlanner()
    planner.update(world, 1)
    const revision = planner.revision
    expect(planner.stats.planned).toBe(1)
    // The same world again, and a copy of it: nothing to do.
    expect(planner.update(world, 1)).toBe(false)
    expect(planner.update({ ...world, trade_routes: [...world.trade_routes!] }, 1)).toBe(false)
    expect(planner.stats.planned).toBe(1)
    expect(planner.revision).toBe(revision)
    const more = worldWith(grid, [
      { id: 1, a: [2, 5], b: [50, 5] },
      { id: 2, a: [2, 20], b: [50, 20] },
    ])
    planner.update(more, 1)
    expect(planner.stats.planned).toBe(2)
    expect(planner.revision).toBeGreaterThan(revision)
  })

  it('plans again when the terrain revision changes, and shows the old road meanwhile', () => {
    const grid = open(60, 30)
    const routes = Array.from({ length: 6 }, (_, i) => ({
      id: i + 1,
      a: [2, 2 + i * 4] as [number, number],
      b: [50, 2 + i * 4] as [number, number],
    }))
    const world = worldWith(grid, routes)
    const planner = new TradePathPlanner()
    for (let i = 0; i < 6; i++) planner.update(world, 1)
    expect(planner.settled).toBe(true)
    const before = planner.pathOf(6)!
    planner.update(world, 2)
    expect(planner.settled).toBe(false)
    // The road at the back of the queue is still the old one, not gone.
    expect(planner.pathOf(6)).toBe(before)
    for (let i = 0; i < 6; i++) planner.update(world, 2)
    expect(planner.stats.planned).toBe(12)
  })

  it('plans over the land: round the water, with the planned cells marked', () => {
    const grid = land([
      '....................',
      '.........~~.........',
      '.........~~.........',
      '.........~~.........',
      '....................',
    ])
    const world = worldWith(grid, [{ id: 1, a: [1, 2], b: [18, 2] }])
    const planner = new TradePathPlanner()
    planner.update(world, 1)
    const path = planner.pathOf(1)!
    for (const i of path.cells) expect(planner.cells[i]).toBe(styleCodeOf(0))
    for (const i of path.cells) {
      const x = i % grid.width
      const y = Math.floor(i / grid.width)
      expect(grid.tiles[y]![x]).not.toBe(TILE_ID.WATER)
    }
    // Where there is no road the cell is empty.
    expect(planner.cells[0]).toBe(0)
  })

  it('marks the cells of a bridge', () => {
    const grid = land(Array.from({ length: 5 }, () => '.'.repeat(8) + '~~~' + '.'.repeat(8)))
    const world = worldWith(grid, [{ id: 1, a: [2, 2], b: [16, 2] }])
    const planner = new TradePathPlanner()
    planner.update(world, 1)
    const wet = [...planner.pathOf(1)!.cells].filter((i) => planner.cells[i]! & PLANNED_BRIDGE)
    expect(wet).toHaveLength(3)
  })

  it('styles the road for the more advanced of the two tribes', () => {
    const grid = open(40, 10)
    const world = worldWith(grid, [{ id: 1, a: [2, 5], b: [36, 5], lineages: ['a', 'b'] }], {
      lineage_eras: [
        { lineage_id: 'a', era_name: 'stone' },
        { lineage_id: 'b', era_name: 'modern' },
      ],
    })
    const planner = new TradePathPlanner()
    planner.update(world, 1)
    const cell = planner.pathOf(1)!.cells[0]!
    expect(planner.cells[cell]).toBe(3)
    // The tribes advance: the same road, new style, no new planning.
    const revision = planner.revision
    const planned = planner.stats.planned
    planner.update(
      {
        ...world,
        lineage_eras: [
          { lineage_id: 'a', era_name: 'medieval' },
          { lineage_id: 'b', era_name: 'medieval' },
        ],
      },
      1,
    )
    expect(planner.cells[cell]).toBe(2)
    expect(planner.revision).toBeGreaterThan(revision)
    expect(planner.stats.planned).toBe(planned)
  })

  it('plans again a route a new building comes to stand on, and only that one', () => {
    const grid = open(60, 30)
    const world = worldWith(grid, [
      { id: 1, a: [2, 5], b: [50, 5] },
      { id: 2, a: [2, 22], b: [50, 22] },
    ])
    const planner = new TradePathPlanner()
    planner.update(world, 1)
    expect(planner.stats.planned).toBe(2)
    const second = planner.pathOf(2)!
    const blocker = planner.pathOf(1)!.cells[20]!
    const x = blocker % grid.width
    const y = Math.floor(blocker / grid.width)
    const built = {
      ...world,
      buildings: [{ id: 1, kind: 'house', x, y, fw: 2, fh: 2 }],
    } as unknown as WorldState
    planner.update(built, 1)
    expect(planner.stats.planned).toBe(3)
    expect(planner.pathOf(2)).toBe(second)
    const rerouted = [...planner.pathOf(1)!.cells]
    for (const dx of [0, 1])
      for (const dy of [0, 1]) expect(rerouted).not.toContain((y + dy) * grid.width + x + dx)
  })

  it('does not stop for buildings a road passes beside, such as carts and signposts', () => {
    const grid = open(60, 30)
    const world = worldWith(grid, [{ id: 1, a: [2, 5], b: [50, 5] }])
    const planner = new TradePathPlanner()
    planner.update(world, 1)
    const cell = planner.pathOf(1)!.cells[20]!
    const cart = { id: 1, kind: 'cart', x: cell % grid.width, y: Math.floor(cell / grid.width), fw: 1, fh: 1 }
    planner.update({ ...world, buildings: [cart] } as unknown as WorldState, 1)
    expect(planner.stats.planned).toBe(1)
  })

  it('counts a route over no ground as without a way, and leaves it undrawn', () => {
    const grid = land(['~~~~~~~~~~~~', '~~~~~~~~~~~~', '~~~~~~~~~~~~'])
    const planner = new TradePathPlanner()
    planner.update(worldWith(grid, [{ id: 1, a: [1, 1], b: [10, 1] }]), 1)
    expect(planner.pathOf(1)).toBeNull()
    expect(planner.stats.noWay).toBe(1)
    expect(planner.cells.every((v) => v === 0)).toBe(true)
  })

  it('reads route coordinates in the grid: the world origin is taken off', () => {
    const grid = open(40, 20)
    const world = worldWith(grid, [{ id: 1, a: [2, 5], b: [36, 5] }], {}, [100, 50])
    const planner = new TradePathPlanner()
    planner.update(world, 1)
    const path = planner.pathOf(1)!
    // The carts' way is the road itself, which starts and ends within a few tiles of each centre.
    expect(Math.abs(path.xs[0]! - 2) + Math.abs(path.ys[0]! - 5)).toBeLessThanOrEqual(4)
    expect(Math.abs(path.xs.at(-1)! - 36) + Math.abs(path.ys.at(-1)! - 5)).toBeLessThanOrEqual(4)
    for (const i of path.cells) expect(i).toBeLessThan(grid.width * grid.height)
  })

  it('leaves out routes whose centres are off the map', () => {
    const grid = open(40, 20)
    const planner = new TradePathPlanner()
    planner.update(worldWith(grid, [{ id: 1, a: [2, 5], b: [90, 5] }]), 1)
    expect(planner.pathOf(1)).toBeNull()
    expect(planner.stats.planned).toBe(0)
  })

  it('starts over when the grid changes shape', () => {
    const planner = new TradePathPlanner()
    planner.update(worldWith(open(40, 20), [{ id: 1, a: [2, 5], b: [36, 5] }]), 1)
    expect(planner.cells.length).toBe(800)
    planner.update(worldWith(open(50, 20), [{ id: 1, a: [2, 5], b: [36, 5] }]), 1)
    expect(planner.cells.length).toBe(1000)
    expect(planner.stats.planned).toBe(2)
  })
})

describe('planning the whole world', () => {
  it('plans many routes over rough ground inside the budget', () => {
    // Water in stripes with a bridgeable gap, rock islands and buildings: every route is found or left out cleanly.
    const rows = Array.from({ length: 80 }, (_, y) =>
      Array.from({ length: 160 }, (_, x) => {
        if (x % 40 === 20 && y % 20 < 14) return '~'
        if ((x * 7 + y * 13) % 29 === 0) return '^'
        if ((x * 3 + y * 5) % 31 === 0) return '#'
        return '.'
      }).join(''),
    )
    const grid = land(rows)
    const routes = Array.from({ length: 40 }, (_, i) => ({
      id: i + 1,
      a: [10 + (i % 8) * 4, 10 + Math.floor(i / 8) * 12] as [number, number],
      b: [130 - (i % 5) * 6, 12 + Math.floor(i / 5) * 8] as [number, number],
    }))
    const planner = new TradePathPlanner()
    const world = worldWith(grid, routes)
    let guard = 0
    while (!planner.settled || guard === 0) {
      planner.update(world, 1)
      if (++guard > 100) break
    }
    expect(planner.settled).toBe(true)
    expect(planner.stats.planned).toBe(40)
    for (const r of routes) {
      const path = planner.pathOf(r.id)
      if (!path) continue
      expectContiguous(grid, path.cells)
    }
  })
})
