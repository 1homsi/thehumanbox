import type { SpriteLayer } from 'xipjs'
import type { Building } from '../../../../shared/types'
import { TILE } from '../../../model/palette'
import { resolveBuildingFootprint } from '../../building-draw/footprints'
import { CELL_GUTTER, type CellAtlas } from '../atlas/cell-atlas'
import { WHITE, writeSprite, type CfDriver, type CfFrame } from '../frame'
import {
  ROAD_BRIDGE,
  ROAD_CANAL,
  ROAD_RAIL,
  ROAD_TRACK,
  bridgeCellKey,
  bridgeIsVertical,
  canalCellKey,
  isStraightRail,
  paintBridgeCell,
  paintCanalCell,
  paintRailCell,
  paintRailCorners,
  paintRailJoinCell,
  paintRoadCell,
  paintRoadCorners,
  railCellKey,
  railCornersKey,
  railJoinKey,
  roadCellKey,
  roadCornersKey,
  roadStyle,
  roadStyleOfCode,
  type RoadStyle,
} from './road-art'
import { CODE_CORNERS, CODE_KIND_SHIFT, CODE_STYLE_SHIFT, tileBlock, type RoadCells } from './road-tiling'
import { PLANNED_BRIDGE, tradePaths, type TradePathPlanner } from '../../trade-paths'

const SPEC_JOIN_SIM = 1
const SPEC_JOIN_PLANNED = 2

/**
 * What one cell is drawn as, from the simulation's road kind there and the planned route's code: the kind
 * above the join flags and the style above that, or -1 for no road. The simulation's cells keep joining
 * every simulated road, as they always did; a planned road also joins the planned roads. A planned road over a
 * railway (a level crossing) or a canal (a bridge) joins only its own route, so the rail keeps its direction.
 */
export function resolveCell(sim: number, plan: number, baseStyle: number): number {
  const planStyle = STYLES.indexOf(roadStyleOfCode(plan & 3))
  const both = SPEC_JOIN_SIM | SPEC_JOIN_PLANNED
  if (sim === ROAD_RAIL || sim === ROAD_CANAL) {
    if (plan === 0) return (baseStyle << 8) | (sim << 4) | SPEC_JOIN_SIM
    return (planStyle << 8) | ((sim === ROAD_CANAL ? ROAD_BRIDGE : ROAD_TRACK) << 4) | SPEC_JOIN_PLANNED
  }
  if (sim === ROAD_BRIDGE) return (baseStyle << 8) | (sim << 4) | SPEC_JOIN_SIM
  if (plan !== 0) return (planStyle << 8) | ((plan & PLANNED_BRIDGE ? ROAD_BRIDGE : ROAD_TRACK) << 4) | both
  if (sim === ROAD_TRACK) return (baseStyle << 8) | (sim << 4) | both
  return -1
}

/** Road cells are one tile each, gutter included (the atlas adds the gutter to the class). */
export const ROAD_CLASSES: ReadonlyArray<readonly [number, number]> = [[TILE + 2, TILE + 2]]

/** A drawn cell's code: its style, then its road kind, above the four join bits. */
const JOIN_BITS = 0xf
const STYLES: readonly RoadStyle[] = ['track', 'cobble', 'paved']

const BLOCK = 32

interface Look {
  key: string
  paint: (ctx: CanvasRenderingContext2D) => void
}

function lookOf(code: number): Look {
  const kind = (code >> CODE_KIND_SHIFT) & 0xf
  const cellStyle = STYLES[(code >> CODE_STYLE_SHIFT) & 3]!
  const mask = code & 0xff
  if (code & CODE_CORNERS) {
    if (kind === ROAD_RAIL) return { key: railCornersKey(mask), paint: (ctx) => paintRailCorners(ctx, mask) }
    return { key: roadCornersKey(cellStyle, mask), paint: (ctx) => paintRoadCorners(ctx, cellStyle, mask) }
  }
  const orth = mask & JOIN_BITS
  if (kind === ROAD_BRIDGE) {
    const vertical = bridgeIsVertical(orth)
    return { key: bridgeCellKey(vertical), paint: (ctx) => paintBridgeCell(ctx, vertical) }
  }
  if (kind === ROAD_RAIL) {
    if (!isStraightRail(mask)) return { key: railJoinKey(mask), paint: (ctx) => paintRailJoinCell(ctx, mask) }
    const vertical = bridgeIsVertical(orth)
    return { key: railCellKey(vertical), paint: (ctx) => paintRailCell(ctx, vertical) }
  }
  if (kind === ROAD_CANAL) return { key: canalCellKey(orth), paint: (ctx) => paintCanalCell(ctx, orth) }
  return { key: roadCellKey(cellStyle, mask), paint: (ctx) => paintRoadCell(ctx, cellStyle, mask) }
}

export function stationCells(
  buildings: readonly Building[] | undefined,
  ox: number,
  oy: number,
  width: number,
) {
  const cells = new Set<number>()
  const parts: number[] = []
  for (const b of buildings ?? []) {
    if (b.ruined || b.ruined_at_tick != null || b.kind.replace(/_/g, '').toLowerCase() !== 'trainstation')
      continue
    const [fw, fh] = resolveBuildingFootprint(b)
    const c0 = b.x - ox
    const r0 = b.y - oy
    parts.push(c0, r0, fw, fh)
    for (let r = r0; r < r0 + fh; r++) for (let c = c0; c < c0 + fw; c++) cells.add(r * width + c)
  }
  return { cells, sig: parts.join(',') }
}

/**
 * Roads and bridges on the ground: one tile sprite per road cell in the visible window, joined to its
 * neighbours. The simulation sends the road kinds on each static frame; the trade routes are planned over
 * the land (`trade-paths.ts`) and merged in, so they join the village roads at the same junctions, in the
 * style of the tribes that trade on them. The layer is rewritten only when the road revision, the planned
 * routes, the era, the window or the atlas changes.
 */
export class RoadDriver implements CfDriver {
  stats = { roads: 0, rebuilds: 0, blocks: 0, ms: 0 }
  /** Planning of the trade routes, for the stats readout. */
  get plan() {
    return this.planner.stats
  }
  private readonly layer: SpriteLayer
  private readonly atlas: CellAtlas
  private readonly planner: TradePathPlanner
  private sig = ''
  private tilingSig = ''
  private readonly blocks = new Map<number, number[]>()
  private readonly looks = new Map<number, Look>()
  private readonly visible: number[][] = []
  private stationsFor: readonly Building[] | undefined = undefined
  private stationsAt = ''
  private stations = stationCells(undefined, 0, 0, 0)

  constructor(layer: SpriteLayer, atlas: CellAtlas, planner: TradePathPlanner = tradePaths) {
    this.layer = layer
    this.atlas = atlas
    this.planner = planner
  }

  update(f: CfFrame): boolean {
    const grid = f.world.grid
    const roads = grid.roads
    const planner = this.planner
    planner.update(f.world, f.terrainRevision)
    // Planned routes are drawn only while the trade-route lens is on, as the straight roads were.
    const planned =
      f.showTrade !== false && planner.cells.length === grid.width * grid.height ? planner.cells : null
    if (!roads && !planned?.some((v) => v !== 0)) {
      if (this.layer.count === 0) return false
      this.layer.clear()
      this.layer.touch()
      this.sig = ''
      return true
    }
    const width = grid.width
    const height = grid.height
    const stationsAt = `${f.ox},${f.oy},${width}`
    if (this.stationsFor !== f.world.buildings || this.stationsAt !== stationsAt) {
      this.stationsFor = f.world.buildings
      this.stationsAt = stationsAt
      this.stations = stationCells(f.world.buildings, f.ox, f.oy, width)
    }
    const style = roadStyle(f.world.current_era)
    const baseStyle = STYLES.indexOf(style)
    const revision = grid.road_revision ?? 0
    const tilingSig = `${revision}|${style}|${planner.revision}|${planned ? 1 : 0}|${width}x${height}|${this.stations.sig}`
    if (tilingSig !== this.tilingSig) {
      this.tilingSig = tilingSig
      this.blocks.clear()
    }
    const { c0, c1, r0, r1 } = f.win
    const sig = `${tilingSig}|${c0},${c1},${r0},${r1}|${this.atlas.epoch}`
    if (sig === this.sig) return false
    const t0 = performance.now()
    this.sig = sig
    const inMap = (r: number, c: number) => r >= 0 && c >= 0 && r < height && c < width
    const simAt = (r: number, c: number) => (inMap(r, c) ? (roads?.[r]?.[c] ?? 0) : 0)
    const grades = grid.road_grades
    const styleAt = (r: number, c: number) => {
      const grade = grades?.[r]?.[c] ?? 0
      return grade > 0 ? Math.min(STYLES.length, grade) - 1 : baseStyle
    }
    const planAt = (r: number, c: number) => (planned && inMap(r, c) ? planned[r * width + c]! : 0)
    const stationSet = this.stations.cells
    const cells: RoadCells = {
      width,
      height,
      spec: (r, c) => {
        const sim = simAt(r, c)
        const plan = planAt(r, c)
        return sim === 0 && plan === 0 ? -1 : resolveCell(sim, plan, styleAt(r, c))
      },
      joins: (spec, r, c) =>
        ((spec & SPEC_JOIN_SIM) !== 0 && simAt(r, c) !== 0) ||
        ((spec & SPEC_JOIN_PLANNED) !== 0 && planAt(r, c) !== 0),
      station: (r, c) => inMap(r, c) && stationSet.has(r * width + c),
    }
    const rLo = Math.max(0, r0)
    const rHi = Math.min(height, r1)
    const cLo = Math.max(0, c0)
    const cHi = Math.min(width, c1)
    const blocksWide = Math.ceil(width / BLOCK)
    let built = 0
    let upper = 0
    const visible = this.visible
    visible.length = 0
    for (let br = Math.floor(rLo / BLOCK); br * BLOCK < rHi; br++) {
      for (let bc = Math.floor(cLo / BLOCK); bc * BLOCK < cHi; bc++) {
        let entries = this.blocks.get(br * blocksWide + bc)
        if (!entries) {
          entries = []
          const br0 = br * BLOCK
          const bc0 = bc * BLOCK
          tileBlock(cells, br0, Math.min(height, br0 + BLOCK), bc0, Math.min(width, bc0 + BLOCK), entries)
          this.blocks.set(br * blocksWide + bc, entries)
          built++
        }
        visible.push(entries)
        upper += entries.length / 2
      }
    }
    this.layer.resize(upper)
    let n = 0
    for (const entries of visible) {
      for (let i = 0; i < entries.length; i += 2) {
        const idx = entries[i]!
        const r = Math.floor(idx / width)
        const c = idx - r * width
        if (r < rLo || r >= rHi || c < cLo || c >= cHi) continue
        const code = entries[i + 1]!
        let look = this.looks.get(code)
        if (!look) {
          look = lookOf(code)
          this.looks.set(code, look)
        }
        const cell = this.atlas.get(look.key) ?? this.atlas.bake(look.key, TILE, TILE, look.paint)
        if (!cell) continue
        writeSprite(
          this.layer,
          n++,
          c * TILE - CELL_GUTTER + cell.cw / 2,
          r * TILE - CELL_GUTTER + cell.ch / 2,
          cell.cw,
          cell.ch,
          cell.atlas,
          cell.frame,
          WHITE,
          0,
          0,
          0,
        )
      }
    }
    this.layer.resize(n)
    this.layer.touch()
    this.stats = {
      roads: n,
      rebuilds: this.stats.rebuilds + 1,
      blocks: this.stats.blocks + built,
      ms: performance.now() - t0,
    }
    return true
  }
}
