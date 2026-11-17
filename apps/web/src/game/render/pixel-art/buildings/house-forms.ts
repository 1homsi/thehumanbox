import { Art, C, flatRoof, gable, isLit, legend, slabRoof, wall } from './kit.ts'
import type { Legend, Look, Ramp } from './kit.ts'
import { ROOF } from '../palette.ts'

/** Left edges of `n` things `iw` wide, evenly spread across `w` pixels starting at `x`. */
export function spread(x: number, w: number, n: number, iw: number): number[] {
  const gap = (w - n * iw) / (n + 1)
  return Array.from({ length: n }, (_, i) => Math.round(x + gap + i * (iw + gap)))
}

/** How many bays `iw` wide (with at least `gap` between them) fit across a wall `w` wide. */
export const baysIn = (w: number, iw: number, gap = 2) => Math.max(1, Math.floor((w - gap) / (iw + gap)))

export interface HouseSpec {
  /** Width of the wall in pixels. */
  w: number
  floors: number
  /** Rows per floor. */
  floorH: number
  roof: Ramp
  wall: Ramp
  window: readonly string[]
  door: readonly string[]
  /** Bays across the front; as many as fit when not given. */
  bays?: number
  /** Where the door stands along the ground floor: 0 left, 1 right; -1 for no door. */
  doorAt?: number
  chimney?: readonly string[]
  /** Where the chimney stands along the roof: 0 left, 1 right. */
  chimneyAt?: number
  /** Dark timber posts and a beam between floors, over the wall. */
  timber?: boolean
  /** A band of this colour between floors. */
  band?: number
  /** A footing of this colour along the ground. */
  footing?: number
  /** A second ramp for the stamps' 5-8 letters (shutters, awnings). */
  alt?: Ramp
  /** No windows on the ground floor. */
  blindGround?: boolean
  /** A line of this colour every second row of the wall: logs, boards, siding. */
  boards?: number
}

export const legendOf = (look: Look, s: HouseSpec): Legend =>
  legend(s.roof, s.wall, isLit(look), s.alt ?? ROOF.slate)

/** The floors of a house on the wall whose top-left is (x, y): windows in every bay, the door in one. */
export function floors(a: Art, x: number, y: number, s: HouseSpec, L: Legend) {
  const ww = s.window[0].length
  const wh = s.window.length
  const dw = s.door[0].length
  const dh = s.door.length
  const n = s.bays ?? baysIn(s.w, Math.max(ww, dw))
  const xs = spread(x, s.w, n, ww)
  const doorBay = (s.doorAt ?? 0.5) < 0 ? -1 : Math.round((s.doorAt ?? 0.5) * (n - 1))
  const bottom = y + s.floors * s.floorH
  if (s.boards) for (let j = y + 2; j < bottom - 1; j += 2) a.hline(x, j, s.w - 1, s.boards)
  if (s.footing) a.hline(x, bottom - 1, s.w, s.footing)
  if (s.timber) {
    a.vline(x, y, bottom - y, C.gold1).vline(x + s.w - 1, y, bottom - y, C.gold1)
    for (let i = 1; i < n; i++) a.vline(Math.round((xs[i - 1] + ww + xs[i]) / 2), y, bottom - y, C.gold1)
  }
  for (let f = 0; f < s.floors; f++) {
    const fy = y + f * s.floorH
    const ground = f === s.floors - 1
    if (f > 0 && (s.band || s.timber)) a.hline(x, fy, s.w, s.timber ? C.gold1 : s.band!)
    for (let i = 0; i < n; i++) {
      if (ground && i === doorBay) {
        a.stamp(s.door, xs[i] + ((ww - dw) >> 1), bottom - dh, L)
        continue
      }
      if (ground && s.blindGround) continue
      a.stamp(s.window, xs[i], fy + Math.max(1, (s.floorH - wh) >> 1) + (f === 0 ? 1 : 0), L)
    }
  }
}

/**
 * A house with its eaves to the front, standing on row `g` with its wall's left edge at `x`: the roof a long
 * slope above the wall, the ridge running left to right. Returns the row of the ridge.
 */
export function eaveOn(
  a: Art,
  look: Look,
  x: number,
  g: number,
  s: HouseSpec & { roofH: number; hip?: number },
): number {
  const L = legendOf(look, s)
  const wh = s.floors * s.floorH
  const wy = g - wh
  const top = wy - s.roofH
  wall(a, x, wy, s.w, wh, s.wall)
  floors(a, x, wy, s, L)
  slabRoof(a, x - 1, top, s.w + 2, s.roofH, s.roof, s.hip ?? 2)
  if (s.chimney) {
    const cw = s.chimney[0].length
    a.stamp(s.chimney, Math.round(x + 2 + (s.chimneyAt ?? 0.8) * (s.w - 4 - cw)), top - 3, L)
  }
  return top
}

/**
 * A house with its gable to the front, standing on row `g` and centred on the columns `cx` and `cx + 1`: two
 * roof slopes meeting above an attic window. Returns the row of the apex.
 */
export function gableOn(
  a: Art,
  look: Look,
  cx: number,
  g: number,
  s: HouseSpec & { thick?: number; shallow?: boolean; attic?: readonly string[] | null },
): number {
  const half = (s.w >> 1) + 1
  const thick = s.thick ?? 3
  const L = legendOf(look, s)
  const wh = s.floors * s.floorH
  const gh = (s.shallow ? Math.ceil(half / 2) : half) + thick - 1
  const top = g - wh - gh
  const wy = gable(a, cx, top, half, s.roof, s.wall, thick, s.shallow ?? false)
  const x = cx - (s.w >> 1) + 1
  wall(a, x, wy, s.w, wh, s.wall, false)
  floors(a, x, wy, s, L)
  if (s.timber) a.hline(x, wy, s.w, C.gold1)
  const attic = s.attic === undefined ? null : s.attic
  if (attic) a.stamp(attic, cx - (attic[0].length >> 1) + 1, wy - attic.length - 1, L)
  if (s.chimney) {
    const off = Math.round(half * 0.5)
    a.stamp(s.chimney, cx + off, top + (s.shallow ? off >> 1 : off) - s.chimney.length + 2, L)
  }
  return top
}

/** A flat-roofed block standing on row `g`: floors under a parapet. Returns the row of the parapet. */
export function flatOn(
  a: Art,
  look: Look,
  x: number,
  g: number,
  s: HouseSpec & { cornice?: number },
): number {
  const L = legendOf(look, s)
  const wh = s.floors * s.floorH
  const wy = g - wh
  wall(a, x, wy, s.w, wh, s.wall, false)
  floors(a, x, wy, s, L)
  flatRoof(a, x - 1, wy - 2, s.w + 2, 2, s.roof)
  if (s.cornice) a.hline(x - 1, wy, s.w + 2, s.cornice)
  return wy - 2
}

/** A sheet big enough for a house of this footprint, its ground row, and the left edge of a wall `w` wide. */
export function plot(look: Look, w: number): { a: Art; g: number; x: number; cx: number } {
  const a = new Art(Math.max(look.fw * 8, w) + 20, look.fh * 8 + 34)
  const x = (a.w - w) >> 1
  return { a, g: a.h - 3, x, cx: x + (w >> 1) - 1 }
}
