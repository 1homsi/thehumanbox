import { TILE } from '../../../model/palette'
import { ERA_TIERS, eraTier } from '../../../model/era-tier'
import { ROCK, SAND, hex } from '../../art-palette'

/** The road kinds a cell holds: the simulation's `ROAD_TRACK`, `ROAD_BRIDGE` and `ROAD_RAIL`. */
export const ROAD_TRACK = 1
export const ROAD_BRIDGE = 2
export const ROAD_RAIL = 3

/** Which way a road continues from a cell. */
export const ROAD_N = 1
export const ROAD_E = 2
export const ROAD_S = 4
export const ROAD_W = 8

/** A dirt track in the early ages, cobbles from the classical age, asphalt from industry on. */
export type RoadStyle = 'track' | 'cobble' | 'paved'

/** The style of a road two tribes built, by the more advanced one's era tier. */
export function roadStyleOfTier(tier: number): RoadStyle {
  return tier >= 5 ? 'paved' : tier >= 2 ? 'cobble' : 'track'
}

/** The style for a planned route's code (see `styleCodeOf`): 1 track, 2 cobble, 3 paved. */
export function roadStyleOfCode(code: number): RoadStyle {
  return code >= 3 ? 'paved' : code === 2 ? 'cobble' : 'track'
}

/**
 * The style of every road on the map in this era: the whole world's roads change together. Eras the
 * tier table does not know (the opening `genesis`) are the earliest, so they get the dirt track.
 */
export function roadStyle(era: string | undefined): RoadStyle {
  const known = era !== undefined && era.toLowerCase().replace(/[-\s]/g, '_') in ERA_TIERS
  return known && eraTier(era) >= 2 ? 'cobble' : 'track'
}

/**
 * Where a road cell continues: the four neighbours that hold a road (off the map counts as none).
 * `roads[row][col]` is the kind of a cell; any non-zero kind joins.
 */
export function roadMask(roads: readonly (readonly number[])[], row: number, col: number): number {
  const at = (r: number, c: number) => (roads[r]?.[c] ?? 0) !== 0
  let mask = 0
  if (at(row - 1, col)) mask |= ROAD_N
  if (at(row, col + 1)) mask |= ROAD_E
  if (at(row + 1, col)) mask |= ROAD_S
  if (at(row, col - 1)) mask |= ROAD_W
  return mask
}

/**
 * A bridge runs across the way the road goes: north to south when the road joins from above or below
 * and not from the sides (a bridge with no joins runs east to west).
 */
export function bridgeIsVertical(mask: number): boolean {
  return (mask & (ROAD_N | ROAD_S)) !== 0 && (mask & (ROAD_E | ROAD_W)) === 0
}

/** The margin a road keeps clear of each tile edge: a track is 4 px wide (2 px inset), cobbles and asphalt 6 px (1 px). */
function inset(style: RoadStyle): number {
  return style === 'track' ? 2 : 1
}

/**
 * Whether pixel (x, y) of a road cell is road: a centre square, plus an arm to each side the road
 * continues to. The arms run to the tile edge so neighbouring cells join without a seam.
 */
export function isRoadPixel(style: RoadStyle, mask: number, x: number, y: number): boolean {
  const a = inset(style)
  const b = TILE - a
  const inX = x >= a && x < b
  const inY = y >= a && y < b
  if (inX && inY) return true
  if (inX && y < a && mask & ROAD_N) return true
  if (inX && y >= b && mask & ROAD_S) return true
  if (inY && x >= b && mask & ROAD_E) return true
  if (inY && x < a && mask & ROAD_W) return true
  return false
}

const TRACK_COLORS = ['#a88a5c', '#8a6c44', '#c3a77a'] as const
const COBBLE_COLORS = ['#9b968b', '#8c877c', '#a7a295'] as const
const MORTAR = '#6e675c'
/** Asphalt: dark and warm, lit on its top-left edge (the art direction's light), with sparse darker grit. */
const ASPHALT = '#48413a'
const ASPHALT_GRIT = '#3e3832'
const ASPHALT_EDGE = hex(ROCK.shade)
const ASPHALT_EDGE_LIT = hex(ROCK.mid)
const ASPHALT_LINE = hex(SAND.light)

/** Whether a straight asphalt cell carries a dash at pixel (x, y): one short dash down the middle. */
function isPavedDash(mask: number, x: number, y: number): boolean {
  const mid = Math.floor(TILE / 2) - 1
  if (mask === (ROAD_N | ROAD_S)) return x === mid && y >= 2 && y <= TILE - 4
  if (mask === (ROAD_E | ROAD_W)) return y === mid && x >= 2 && x <= TILE - 4
  return false
}

/** The colour of road pixel (x, y): deterministic in the position and the mask, so a cell always looks the same. */
export function roadPixelColor(style: RoadStyle, mask: number, x: number, y: number): string {
  if (style === 'track') {
    // Worn ruts and pale stones scattered over the dirt.
    if ((x * 7 + y * 13 + mask * 5) % 11 === 0) return TRACK_COLORS[1]
    if ((x * 3 + y * 5 + mask) % 9 === 0) return TRACK_COLORS[2]
    return TRACK_COLORS[0]
  }
  if (style === 'paved') {
    // A dash on straight runs; the road's rim is a shade lighter, most on the sides facing the light.
    if (isPavedDash(mask, x, y)) return ASPHALT_LINE
    if (!isRoadPixel(style, mask, x - 1, y) || !isRoadPixel(style, mask, x, y - 1)) return ASPHALT_EDGE_LIT
    if (!isRoadPixel(style, mask, x + 1, y) || !isRoadPixel(style, mask, x, y + 1)) return ASPHALT_EDGE
    return (x * 7 + y * 13 + mask * 3) % 11 === 0 ? ASPHALT_GRIT : ASPHALT
  }
  // Cobbles: rows of stones with a mortar line every other row, the joints staggered.
  if (y % 2 === 0) return MORTAR
  if ((x + (y >> 1) * 2 + mask) % 3 === 0) return MORTAR
  return COBBLE_COLORS[(x * 5 + y * 3) % COBBLE_COLORS.length]!
}

/** Every painted pixel of a road cell, as `[x, y, colour]`. Pure, so the art can be checked without a canvas. */
export function roadCellPixels(style: RoadStyle, mask: number): [number, number, string][] {
  const out: [number, number, string][] = []
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      if (isRoadPixel(style, mask, x, y)) out.push([x, y, roadPixelColor(style, mask, x, y)])
    }
  }
  return out
}

export const RAIL_COLOR = '#4a3825'
const PLANK = ['#8a6a45', '#7a5c3a'] as const

/**
 * Every painted pixel of a bridge cell, as `[x, y, colour]`: planks across the crossing with a dark
 * rail along each side. A horizontal bridge (east to west) has its planks in columns; a vertical one in rows.
 */
export function bridgeCellPixels(vertical: boolean): [number, number, string][] {
  const out: [number, number, string][] = []
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      // `across` is the position along the width of the bridge, `along` the position along its length.
      const across = vertical ? x : y
      const along = vertical ? y : x
      const color = across === 0 || across === TILE - 1 ? RAIL_COLOR : PLANK[along % 2]!
      out.push([x, y, color])
    }
  }
  return out
}

export const RAIL_STEEL = '#8d9399'
export const RAIL_TIE = '#5b4430'

/**
 * Every painted pixel of a railway cell, as `[x, y, colour]`: two steel rails running along the way the track
 * goes (north to south when it joins from above or below and not from the sides, otherwise east to west),
 * with sleepers across them.
 */
export function railCellPixels(vertical: boolean): [number, number, string][] {
  const out: [number, number, string][] = []
  const lo = Math.floor(TILE / 3) - 1
  const hi = TILE - 1 - lo
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const across = vertical ? x : y
      const along = vertical ? y : x
      if (across === lo || across === hi) out.push([x, y, RAIL_STEEL])
      else if (along % 3 === 1 && across > lo && across < hi) out.push([x, y, RAIL_TIE])
    }
  }
  return out
}

/** Paint one railway cell at the context origin. */
export function paintRailCell(ctx: CanvasRenderingContext2D, vertical: boolean): void {
  for (const [x, y, color] of railCellPixels(vertical)) {
    ctx.fillStyle = color
    ctx.fillRect(x, y, 1, 1)
  }
}

/** The atlas key of a railway cell: which way its track runs. */
export function railCellKey(vertical: boolean): string {
  return vertical ? 'L|v' : 'L|h'
}

/** Paint one road cell at the context origin (one canvas pixel per tile pixel). */
export function paintRoadCell(ctx: CanvasRenderingContext2D, style: RoadStyle, mask: number): void {
  for (const [x, y, color] of roadCellPixels(style, mask)) {
    ctx.fillStyle = color
    ctx.fillRect(x, y, 1, 1)
  }
}

/** Paint one bridge cell at the context origin. */
export function paintBridgeCell(ctx: CanvasRenderingContext2D, vertical: boolean): void {
  for (const [x, y, color] of bridgeCellPixels(vertical)) {
    ctx.fillStyle = color
    ctx.fillRect(x, y, 1, 1)
  }
}

/** The atlas key of a road cell: its style and joins. */
export function roadCellKey(style: RoadStyle, mask: number): string {
  return `R|${style}|${mask}`
}

/** The atlas key of a bridge cell: which way it crosses. */
export function bridgeCellKey(vertical: boolean): string {
  return vertical ? 'B|v' : 'B|h'
}

/** The simulation's `ROAD_CANAL`: a dug irrigation channel. */
export const ROAD_CANAL = 4
export const CANAL_WATER = '#3f7fa8'
export const CANAL_SHINE = '#7fb4d2'
export const CANAL_BANK = '#6b5a3e'

/**
 * Whether a canal cell's pixel (x, y) is water: a 4-pixel channel down the middle of the cell, running to
 * the edge on each side the channel continues to. Coordinates one step outside the cell follow the same
 * rule, so the banks of neighbouring cells meet without a seam.
 */
function canalWater(mask: number, x: number, y: number): boolean {
  const lo = 2
  const hi = TILE - 2
  const inX = x >= lo && x < hi
  const inY = y >= lo && y < hi
  if (inX && inY) return true
  if (inX && y < lo && mask & ROAD_N) return true
  if (inX && y >= hi && mask & ROAD_S) return true
  if (inY && x >= hi && mask & ROAD_E) return true
  if (inY && x < lo && mask & ROAD_W) return true
  return false
}

/** Every painted pixel of a canal cell, as `[x, y, colour]`: water with a bank of earth on either side. */
export function canalCellPixels(mask: number): [number, number, string][] {
  const out: [number, number, string][] = []
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      if (canalWater(mask, x, y)) {
        // A lighter pixel every few along the water gives it a moving look without any animation.
        out.push([x, y, (x + y) % 4 === 0 ? CANAL_SHINE : CANAL_WATER])
      } else if (
        canalWater(mask, x - 1, y) ||
        canalWater(mask, x + 1, y) ||
        canalWater(mask, x, y - 1) ||
        canalWater(mask, x, y + 1)
      ) {
        out.push([x, y, CANAL_BANK])
      }
    }
  }
  return out
}

/** Paint one canal cell at the context origin. */
export function paintCanalCell(ctx: CanvasRenderingContext2D, mask: number): void {
  for (const [x, y, color] of canalCellPixels(mask)) {
    ctx.fillStyle = color
    ctx.fillRect(x, y, 1, 1)
  }
}

/** The atlas key of a canal cell: the way it joins. */
export function canalCellKey(mask: number): string {
  return `C|${mask}`
}
