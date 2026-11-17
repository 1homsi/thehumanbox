import { Art, rows } from '../art.ts'
import type { Legend } from '../art.ts'
import { C, INK, ROOF, WALL } from '../palette.ts'
import type { Ramp, RoofName } from '../palette.ts'

/** What decides how one building is drawn. */
export interface Look {
  kind: string
  /** Footprint in tiles. */
  fw: number
  fh: number
  /** 0..7, stable for a building: picks one of a kind's plans and colours. */
  variant: number
  /** 0 by day, 1..3 as night falls: windows light up. */
  night: number
  /** Architectural era of the owning tribe (see ERA_TIERS). */
  tier: number
  /** A passing state (a shipyard's hull, an empty launch pad). */
  state: string
  /** The land an early home stands on (see HomeLand). */
  land: string
  /** The tribe's roof colour for its homes. */
  roof?: RoofName
}

/**
 * The letters every building stamp shares. 1-4 are the roof ramp and a-d the wall ramp of the building being
 * drawn (highlight, lit, shade, deep), 5-8 a second ramp (an awning, a tower's cap). w and x are window
 * glass, lit at night. The rest are fixed colours of the master palette.
 */
export function legend(roof: Ramp, wall: Ramp, lit = false, alt: Ramp = ROOF.slate): Legend {
  return {
    1: roof[0],
    2: roof[1],
    3: roof[2],
    4: roof[3],
    a: wall[0],
    b: wall[1],
    c: wall[2],
    d: wall[3],
    5: alt[0],
    6: alt[1],
    7: alt[2],
    8: alt[3],
    w: lit ? C.gold5 : C.blue4,
    x: lit ? C.gold4 : C.blue2,
    k: INK,
    e: C.gold2,
    f: C.gold1,
    g: C.gold3,
    G: C.tan2,
    s: C.grey8,
    t: C.grey7,
    u: C.grey6,
    v: C.grey5,
    z: C.grey4,
    h: C.grey9,
    o: C.grey3,
    O: C.grey2,
    y: C.gold5,
    Y: C.gold4,
    r: C.red3,
    R: C.red4,
    q: C.red2,
    Q: C.red1,
    n: C.green2,
    N: C.green3,
    m: C.green1,
    M: C.green4,
    l: C.blue4,
    L: C.blue3,
    j: C.blue2,
    J: C.blue1,
    i: C.blue5,
    p: C.plum2,
    P: C.plum4,
    T: C.tan5,
    U: C.tan4,
    V: C.tan3,
    H: C.tan1,
    I: C.tan0,
  }
}

/** Whether the windows are lit: from dusk on. */
export const isLit = (look: Look) => look.night >= 1

/**
 * A roof seen from the front with its ridge running left to right: a lit ridge line, a slope in the roof's
 * main tone with a course of tiles every third row, the right end in shade, and a dark eave along the bottom.
 * `hip` rounds the top corners off, one pixel every two rows.
 */
export function slabRoof(
  a: Art,
  x: number,
  y: number,
  w: number,
  h: number,
  r: Ramp,
  hip = 2,
  courses = true,
) {
  for (let j = 0; j < h; j++) {
    const inset = Math.max(0, hip - (j >> 1))
    for (let px = x + inset; px < x + w - inset; px++) {
      let c = r[1]
      if (j === 0) c = r[0]
      else if (j === h - 1) c = r[3]
      else {
        const course = courses && j % 3 === 0
        if (course) c = (px - x + (j / 3) * 2) % 4 === 3 ? r[1] : r[2]
        if (px >= x + w - inset - 2) c = course ? r[3] : r[2]
      }
      a.set(px, y + j, c)
    }
  }
}

/**
 * A roof seen gable-on: two bands `thick` pixels deep meeting at the top, the left one lit and the right one
 * in shade. Each band falls one pixel per pixel, or one per two with `shallow`. The apex is the two columns
 * `cx` and `cx + 1`, and the roof is `half` pixels wide on each side of the gap between them. The wall under
 * the bands is filled down to the bottom of the gable, `inset` pixels in from the eaves, with a line of shadow
 * under the roof. Returns the row just below the gable, where the wall proper starts.
 */
export function gable(
  a: Art,
  cx: number,
  y: number,
  half: number,
  roof: Ramp,
  wallRamp: Ramp | null,
  thick = 3,
  shallow = false,
  inset = 2,
): number {
  const bottom = y + (shallow ? Math.ceil(half / 2) : half) + thick - 1
  for (let d = 0; d < half; d++) {
    const top = y + (shallow ? d >> 1 : d)
    for (let t = 0; t < thick; t++) {
      a.set(cx - d, top + t, t === 0 ? roof[0] : roof[1])
      a.set(cx + 1 + d, top + t, t === thick - 1 ? roof[3] : roof[2])
    }
    if (!wallRamp || d >= half - inset) continue
    for (let row = top + thick; row < bottom; row++) {
      const c = row === top + thick ? wallRamp[2] : wallRamp[0]
      a.set(cx - d, row, c)
      a.set(cx + 1 + d, row, c)
    }
  }
  return bottom
}

/** Materials built of blocks: a wall of them carries a few drawn joints, so it is not a blank panel. */
const BLOCKY = new Set<Ramp>([WALL.brick, WALL.darkBrick, WALL.stone, WALL.darkStone])

/**
 * A wall seen from the front, lit from the top-left: the lit tone, a band of shadow under the eave, the right
 * side in shade and a darker footing. A brick or stone wall also gets a few joints, placed in the two corners
 * the eye skips (low on the lit side, high on the shaded side): enough to say what it is built of, with none
 * of the all-over grid that reads as a filled texture.
 */
export function wall(a: Art, x: number, y: number, w: number, h: number, r: Ramp, eave = true) {
  a.rect(x, y, w, h, r[0])
  const side = w >= 14 ? 2 : 1
  a.rect(x + w - side, y, side, h, r[1])
  if (eave) a.hline(x, y, w, r[2])
  a.hline(x, y + h - 1, w, r[2])
  if (BLOCKY.has(r) && w >= 12 && h >= 9) {
    const bottom = y + h - 1
    a.hline(x + 1, bottom - 2, 2, r[1])
      .hline(x + 4, bottom - 4, 2, r[1])
      .set(x + 2, bottom - 4, r[1])
    a.hline(x + w - side - 3, y + 2, 2, r[1]).set(x + w - side - 5, y + 4, r[1])
  }
}

/** A flat roof behind a parapet: the top surface lit, the parapet's inner edge in shade. */
export function flatRoof(a: Art, x: number, y: number, w: number, h: number, r: Ramp) {
  a.rect(x, y, w, h, r[1])
  a.hline(x, y, w, r[0])
  a.hline(x, y + h - 1, w, r[3])
  a.vline(x + w - 1, y + 1, h - 1, r[2])
}

export const WINDOW = {
  /** A framed four-pane window with a sill. */
  framed: rows('framed', 'eeee', 'ewxe', 'exxe', 'cccc'),
  /** A small square window under a lintel. */
  small: rows('small', 'fff', 'fwx', 'fxx'),
  /** A tall sash window in a white frame. */
  sash: rows('sash', 'hhhh', 'hwxh', 'hhhh', 'hxxh', 'cccc'),
  /** A tall window with shutters. */
  shutter: rows('shutter', '6ee6', '6wx6', '6xx6', '6xx6', 'cccc'),
  /** An arched window. */
  arch: rows('arch', '.ee.', 'ewxe', 'exxe', 'exxe'),
  /** A slit in a stone wall. */
  slit: rows('slit', 'o', 'o', 'o'),
  /** A wide modern pane. */
  wide: rows('wide', 'wwxxxx', 'wxxxxx', 'xxxxxx'),
  /** A shop window. */
  shop: rows('shop', 'eeeeee', 'ewwxxe', 'ewxxxe', 'exxxxe', 'cccccc'),
  /** A round window. */
  round: rows('round', '.ee.', 'ewxe', 'exxe', '.ee.'),
} as const

export const DOOR = {
  /** A dark doorway with no door: huts and early homes. */
  open: rows('open', 'ff', 'kk', 'kk', 'kk'),
  /** A plank door with a brass handle. */
  plank: rows('plank', 'ffff', 'feef', 'feef', 'feyf', 'feef', 'feef'),
  /** A low plank door. */
  low: rows('low', 'fff', 'fef', 'fey', 'fef'),
  /** An arched door. */
  arch: rows('arch', '.ff.', 'feef', 'feef', 'feyf', 'feef', 'feef'),
  /** A panelled door under a fanlight. */
  panel: rows('panel', 'hhhh', 'hwxh', 'hQQh', 'hQyh', 'hQQh', 'hQQh'),
  /** Double doors: halls and churches. */
  double: rows('double', '.ffff.', 'feffef', 'feffef', 'feyyef', 'feffef', 'feffef', 'feffef'),
  /** A glass door. */
  glass: rows('glass', 'oooo', 'owxo', 'owxo', 'oxxo', 'oxxo'),
} as const

export const CHIMNEY = {
  stone: rows('stone', 'vvv', 'tus', 'tus', 'tus', 'tus'),
  brick: rows('brick', 'QQQ', 'Rrq', 'Rrq', 'Rrq', 'Rrq'),
  pot: rows('pot', '.o.', 'vvv', 'tus', 'tus', 'tus'),
} as const

/** Finishes a drawing: the ink outline round its silhouette, then cut down to what was drawn. */
export function finish(a: Art): Art {
  return a.outline(INK).trim()
}

/**
 * Finishes something that lies on the ground (a plot, a pond, paving): it is edged in a darker tone of
 * itself, not in ink, because it is part of the land and not a thing standing on it.
 */
export function finishGround(a: Art, edge: number): Art {
  return a.outline(edge).trim()
}

/** A blank sheet with room for any building of this footprint and the outline round it. */
export function sheet(look: Look, extraW = 16, extraH = 26): Art {
  return new Art(look.fw * 8 + extraW, look.fh * 8 + extraH)
}

export { Art, rows, C, INK, ROOF, WALL }
export type { Legend, Ramp, RoofName }
