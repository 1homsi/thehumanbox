import type { Building, WorldState } from '../../../../shared/types'
import { TILE } from '../../../model/palette'
import { lineageEraTiers } from '../../draw-helpers'
import { normKind, resolveBuildingFootprint } from '../../building-draw/footprints'
import { ROAD_BRIDGE, ROAD_RAIL, ROAD_TRACK } from '../roads/road-art'
import { nightLevel } from './night-sky'
import type { CfFrame } from './frame'

type Ctx = CanvasRenderingContext2D

const POWER_TIER = 5
const POLE_SPACING = 4
const DROP_REACH = 3

const GENERATORS = new Set(['PowerPlant', 'FusionPlant', 'SolarArray', 'WindFarm'])
const SOURCES = new Set([...GENERATORS, 'Substation'])
const UNPOWERED = new Set([
  'Aqueduct',
  'Bench',
  'Bridge',
  'BusStop',
  'Cart',
  'Cemetery',
  'Crosswalk',
  'Dovecote',
  'Fence',
  'FlagPole',
  'FoodCart',
  'Gallows',
  'Garden',
  'Gate',
  'GraveStone',
  'Hyperloop',
  'Lamppost',
  'Maglev',
  'MarketStall',
  'Monument',
  'Obelisk',
  'Orchard',
  'ParkingLot',
  'Pen',
  'PlayGround',
  'Plaza',
  'Pond',
  'Pyramid',
  'Shrine',
  'Signpost',
  'Statue',
  'StreetLight',
  'TelephonePole',
  'Tent',
  'TriumphalArch',
  'Vineyard',
  'Wall',
  'Well',
  'Ziggurat',
])

const WOOD = '#4a3a2a'
const WIRE = 'rgba(40,36,32,0.75)'
const LAMP = '#ffe08a'

export interface PowerPlan {
  poles: number[]
  wires: number[]
  drops: number[]
}

export interface PowerInput {
  roads: ArrayLike<ArrayLike<number> | undefined> | undefined
  width: number
  height: number
  ox: number
  oy: number
  buildings: readonly Building[]
  tiers: ReadonlyMap<string, number>
}

const EMPTY: PowerPlan = { poles: [], wires: [], drops: [] }
const STEP_C = [0, 1, 0, -1]
const STEP_R = [-1, 0, 1, 0]

function makeScratch(size: number) {
  return {
    size,
    dist: new Int32Array(size).fill(-1),
    parent: new Int32Array(size).fill(-1),
    inTree: new Uint8Array(size),
    isEnd: new Uint8Array(size),
    children: new Uint8Array(size),
    onlyChild: new Int32Array(size).fill(-1),
  }
}

let scratch = makeScratch(0)

function isLine(kind: number): boolean {
  return kind === ROAD_TRACK || kind === ROAD_BRIDGE || kind === ROAD_RAIL
}

interface Site {
  id: number
  c0: number
  r0: number
  c1: number
  r1: number
  source: boolean
}

export function powerNetwork(input: PowerInput): PowerPlan {
  const { roads, width, height, ox, oy, buildings, tiers } = input
  if (!roads || width <= 0 || height <= 0) return EMPTY
  const powered = new Set<string>()
  const live: { b: Building; lineage: string; kind: string }[] = []
  for (const b of buildings) {
    const lineage = b.lineage_id ?? b.owner_lineage
    if (!lineage || b.ruined || (b.construction_progress ?? 1) < 1) continue
    if ((tiers.get(lineage) ?? 0) < POWER_TIER) continue
    const kind = normKind(b.kind)
    live.push({ b, lineage, kind })
    if (GENERATORS.has(kind)) powered.add(lineage)
  }
  if (powered.size === 0) return EMPTY

  const sites: Site[] = []
  for (const { b, lineage, kind } of live) {
    if (!powered.has(lineage)) continue
    const source = SOURCES.has(kind)
    if (!source && UNPOWERED.has(kind)) continue
    const [fw, fh] = resolveBuildingFootprint(b)
    const c0 = b.x - ox
    const r0 = b.y - oy
    sites.push({ id: b.id, c0, r0, c1: c0 + fw - 1, r1: r0 + fh - 1, source })
  }
  sites.sort((a, b) => a.id - b.id)

  const lineAt = (c: number, r: number) =>
    c >= 0 && r >= 0 && c < width && r < height && isLine(roads[r]?.[c] ?? 0)
  const access = (s: Site): number => {
    let best = -1
    let bestD = DROP_REACH + 1
    for (let r = s.r0 - DROP_REACH; r <= s.r1 + DROP_REACH; r++) {
      const dr = r < s.r0 ? s.r0 - r : r > s.r1 ? r - s.r1 : 0
      for (let c = s.c0 - DROP_REACH; c <= s.c1 + DROP_REACH; c++) {
        const dc = c < s.c0 ? s.c0 - c : c > s.c1 ? c - s.c1 : 0
        const d = dr + dc
        if (d === 0 || d >= bestD || !lineAt(c, r)) continue
        best = r * width + c
        bestD = d
      }
    }
    return best
  }

  const n = width * height
  if (scratch.size < n) scratch = makeScratch(n)
  const { dist, parent, inTree, isEnd, children, onlyChild } = scratch
  const order: number[] = []
  const entry = sites.map(access)
  for (let i = 0; i < sites.length; i++) {
    const a = entry[i]
    if (!sites[i].source || a < 0 || dist[a] >= 0) continue
    dist[a] = 0
    parent[a] = -1
    order.push(a)
  }
  if (order.length === 0) return EMPTY
  for (let head = 0; head < order.length; head++) {
    const v = order[head]
    const r = Math.floor(v / width)
    const c = v - r * width
    for (let k = 0; k < 4; k++) {
      const nc = c + STEP_C[k]
      const nr = r + STEP_R[k]
      if (!lineAt(nc, nr)) continue
      const u = nr * width + nc
      if (dist[u] >= 0) continue
      dist[u] = dist[v] + 1
      parent[u] = v
      order.push(u)
    }
  }

  for (let i = 0; i < sites.length; i++) {
    const a = entry[i]
    if (a < 0 || dist[a] < 0) continue
    isEnd[a] = 1
    let v = a
    while (!inTree[v]) {
      inTree[v] = 1
      const p = parent[v]
      if (p < 0) break
      children[p] = Math.min(255, children[p] + 1)
      onlyChild[p] = v
      v = p
    }
  }

  const poleOf = new Map<number, number>()
  const run = new Map<number, number>()
  const poles: number[] = []
  const wires: number[] = []
  for (const v of order) {
    if (!inTree[v]) continue
    const p = parent[v]
    const child = onlyChild[v]
    const straight = p >= 0 && children[v] === 1 && v - p === child - v
    const steps = p < 0 ? 0 : poleOf.has(p) ? 1 : run.get(p)! + 1
    if (p >= 0 && !isEnd[v] && straight && steps < POLE_SPACING) {
      run.set(v, steps)
      continue
    }
    const index = poles.length / 2
    poleOf.set(v, index)
    const r = Math.floor(v / width)
    poles.push(v - r * width, r)
    if (p < 0) continue
    let u = p
    while (!poleOf.has(u)) u = parent[u]
    wires.push(poleOf.get(u)!, index)
  }

  const drops: number[] = []
  for (let i = 0; i < sites.length; i++) {
    const a = entry[i]
    const pole = a >= 0 ? poleOf.get(a) : undefined
    if (pole === undefined) continue
    const s = sites[i]
    const r = Math.floor(a / width)
    const c = a - r * width
    drops.push(pole, Math.min(s.c1, Math.max(s.c0, c)), Math.min(s.r1, Math.max(s.r0, r)))
  }
  for (const v of order) {
    dist[v] = -1
    parent[v] = -1
    inTree[v] = 0
    isEnd[v] = 0
    children[v] = 0
    onlyChild[v] = -1
  }
  return { poles, wires, drops }
}

interface PlanCache {
  roads: unknown
  revision: number
  buildings: unknown
  buildingKey: string
  eras: unknown
  eraKey: string
  frame: string
  plan: PowerPlan
}

let cache: PlanCache | null = null

function mix(h: number, s: string | null | undefined): number {
  if (!s) return Math.imul(h ^ 0x9e37, 16777619)
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h
}

function buildingsKey(buildings: readonly Building[]): string {
  let h = 2166136261
  let count = 0
  for (const b of buildings) {
    if (b.ruined || (b.construction_progress ?? 1) < 1) continue
    count++
    h = Math.imul(h ^ b.id, 16777619)
    h = Math.imul(h ^ b.x, 16777619)
    h = Math.imul(h ^ b.y, 16777619)
    h = mix(h, b.kind)
    h = mix(h, b.lineage_id ?? b.owner_lineage)
  }
  return `${count}:${h >>> 0}`
}

export function powerPlanOf(world: WorldState): PowerPlan {
  const grid = world.grid
  const buildings = world.buildings ?? []
  const roads = grid.roads
  const revision = grid.road_revision ?? 0
  const frame = `${grid.width}|${grid.height}|${grid.origin_x ?? 0}|${grid.origin_y ?? 0}`
  const prev = cache
  const buildingKey = prev && prev.buildings === buildings ? prev.buildingKey : buildingsKey(buildings)
  const eraKey =
    prev && prev.eras === world.lineage_eras ? prev.eraKey : JSON.stringify(world.lineage_eras ?? null)
  if (
    prev &&
    prev.roads === roads &&
    prev.revision === revision &&
    prev.buildingKey === buildingKey &&
    prev.eraKey === eraKey &&
    prev.frame === frame
  ) {
    prev.buildings = buildings
    prev.eras = world.lineage_eras
    return prev.plan
  }
  const plan = powerNetwork({
    roads,
    width: grid.width,
    height: grid.height,
    ox: grid.origin_x ?? 0,
    oy: grid.origin_y ?? 0,
    buildings,
    tiers: lineageEraTiers(world.lineage_eras),
  })
  cache = { roads, revision, buildings, buildingKey, eras: world.lineage_eras, eraKey, frame, plan }
  return plan
}

export function paintPower(ctx: Ctx, f: CfFrame): void {
  const { world, bounds } = f
  if (!world.buildings?.length || !world.grid?.roads) return
  const plan = powerPlanOf(world)
  if (plan.poles.length === 0) return
  const { poles, wires, drops } = plan
  const night = nightLevel(world) > 0
  const x0 = bounds.c0 * TILE - 16
  const x1 = (bounds.c1 + 1) * TILE + 16
  const y0 = bounds.r0 * TILE - 16
  const y1 = (bounds.r1 + 1) * TILE + 16
  const count = poles.length / 2
  const tx = new Float64Array(count)
  const ty = new Float64Array(count)
  const seen = new Uint8Array(count)
  for (let i = 0; i < count; i++) {
    tx[i] = poles[2 * i] * TILE + 1
    ty[i] = poles[2 * i + 1] * TILE - 8
    seen[i] = tx[i] >= x0 && tx[i] <= x1 && ty[i] >= y0 && ty[i] <= y1 ? 1 : 0
  }
  const sagTo = (ax: number, ay: number, bx: number, by: number, sag: number) => {
    ctx.moveTo(ax, ay)
    for (let s = 1; s <= 4; s++) {
      const t = s / 4
      ctx.lineTo(ax + (bx - ax) * t, ay + (by - ay) * t + sag * 4 * t * (1 - t))
    }
  }

  ctx.save()
  ctx.strokeStyle = WIRE
  ctx.lineWidth = 0.6
  ctx.beginPath()
  for (let i = 0; i < wires.length; i += 2) {
    const a = wires[i]
    const b = wires[i + 1]
    if (!seen[a] && !seen[b]) continue
    sagTo(tx[a], ty[a], tx[b], ty[b], 2)
  }
  for (let i = 0; i < drops.length; i += 3) {
    const a = drops[i]
    if (!seen[a]) continue
    sagTo(tx[a], ty[a], drops[i + 1] * TILE + TILE / 2, drops[i + 2] * TILE + 1, 1)
  }
  ctx.stroke()
  for (let i = 0; i < count; i++) {
    if (!seen[i]) continue
    const x = tx[i]
    const y = ty[i]
    ctx.globalAlpha = 1
    ctx.fillStyle = WOOD
    ctx.fillRect(x, y, 1, 10)
    ctx.fillRect(x - 2, y + 1, 5, 1)
    if (night) {
      ctx.globalAlpha = 0.35
      ctx.fillStyle = LAMP
      ctx.beginPath()
      ctx.arc(x + 0.5, y, 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.fillRect(x, y - 1, 1, 1)
    }
  }
  ctx.restore()
}
