import type { SpriteLayer } from 'xipjs'
import { TILE } from '../../../model/palette'
import { CELL_GUTTER, type CellAtlas } from '../atlas/cell-atlas'
import { WHITE, writeSprite, type CfDriver, type CfFrame } from '../frame'
import {
  ROAD_BRIDGE,
  ROAD_CANAL,
  ROAD_RAIL,
  ROAD_N,
  ROAD_E,
  ROAD_S,
  ROAD_W,
  ROAD_TRACK,
  bridgeCellKey,
  bridgeIsVertical,
  canalCellKey,
  paintBridgeCell,
  paintCanalCell,
  paintRailCell,
  paintRoadCell,
  railCellKey,
  roadCellKey,
  roadStyle,
  roadStyleOfCode,
  type RoadStyle,
} from './road-art'
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

/**
 * Roads and bridges on the ground: one tile sprite per road cell in the visible window, joined to its
 * neighbours. The simulation sends the road kinds on each static frame; the trade routes are planned over
 * the land (`trade-paths.ts`) and merged in, so they join the village roads at the same junctions, in the
 * style of the tribes that trade on them. The layer is rewritten only when the road revision, the planned
 * routes, the era, the window or the atlas changes.
 */
export class RoadDriver implements CfDriver {
  stats = { roads: 0, rebuilds: 0, ms: 0 }
  /** Planning of the trade routes, for the stats readout. */
  get plan() {
    return this.planner.stats
  }
  private readonly layer: SpriteLayer
  private readonly atlas: CellAtlas
  private readonly planner: TradePathPlanner
  private sig = ''
  private cells: number[] = []
  private codes: number[] = []

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
    const style = roadStyle(f.world.current_era)
    const baseStyle = STYLES.indexOf(style)
    const revision = grid.road_revision ?? 0
    const { c0, c1, r0, r1 } = f.win
    const sig = `${revision}|${style}|${planner.revision}|${planned ? 1 : 0}|${c0},${c1},${r0},${r1}|${this.atlas.epoch}`
    if (sig === this.sig) return false
    const t0 = performance.now()
    this.sig = sig
    const cells = this.cells
    const codes = this.codes
    cells.length = 0
    codes.length = 0
    const width = grid.width
    const height = grid.height
    const simAt = (r: number, c: number) =>
      r >= 0 && c >= 0 && r < height && c < width ? (roads?.[r]?.[c] ?? 0) : 0
    const planAt = (r: number, c: number) =>
      planned && r >= 0 && c >= 0 && r < height && c < width ? planned[r * width + c]! : 0
    for (let r = Math.max(0, r0); r < Math.min(height, r1); r++) {
      for (let c = Math.max(0, c0); c < Math.min(width, c1); c++) {
        const spec = resolveCell(simAt(r, c), planAt(r, c), baseStyle)
        if (spec < 0) continue
        const kind = (spec >> 4) & 0xf
        const joinSim = (spec & SPEC_JOIN_SIM) !== 0
        const joinPlanned = (spec & SPEC_JOIN_PLANNED) !== 0
        const joins = (r2: number, c2: number) =>
          (joinSim && simAt(r2, c2) !== 0) || (joinPlanned && planAt(r2, c2) !== 0)
        let mask = 0
        if (joins(r - 1, c)) mask |= ROAD_N
        if (joins(r, c + 1)) mask |= ROAD_E
        if (joins(r + 1, c)) mask |= ROAD_S
        if (joins(r, c - 1)) mask |= ROAD_W
        cells.push(r * width + c)
        codes.push(((spec >> 8) << 8) | (kind << 4) | mask)
      }
    }
    this.layer.resize(cells.length)
    let n = 0
    for (let i = 0; i < cells.length; i++) {
      const idx = cells[i]!
      const code = codes[i]!
      const kind = (code >> 4) & 0xf
      const mask = code & JOIN_BITS
      const cellStyle = STYLES[code >> 8]!
      const r = Math.floor(idx / grid.width)
      const c = idx - r * grid.width
      let key: string
      let paint: (ctx: CanvasRenderingContext2D) => void
      if (kind === ROAD_BRIDGE) {
        const vertical = bridgeIsVertical(mask)
        key = bridgeCellKey(vertical)
        paint = (ctx) => paintBridgeCell(ctx, vertical)
      } else if (kind === ROAD_RAIL) {
        const vertical = bridgeIsVertical(mask)
        key = railCellKey(vertical)
        paint = (ctx) => paintRailCell(ctx, vertical)
      } else if (kind === ROAD_CANAL) {
        key = canalCellKey(mask)
        paint = (ctx) => paintCanalCell(ctx, mask)
      } else {
        key = roadCellKey(cellStyle, mask)
        paint = (ctx) => paintRoadCell(ctx, cellStyle, mask)
      }
      const cell = this.atlas.get(key) ?? this.atlas.bake(key, TILE, TILE, paint)
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
    this.layer.resize(n)
    this.layer.touch()
    this.stats = { roads: n, rebuilds: this.stats.rebuilds + 1, ms: performance.now() - t0 }
    return true
  }
}
