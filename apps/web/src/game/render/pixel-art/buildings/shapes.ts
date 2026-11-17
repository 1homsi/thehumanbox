import type { Art } from '../art.ts'
import type { Ramp } from '../palette.ts'

/**
 * Half-widths of each row of a pixel dome, top to bottom, by radius: the circles a pixel artist learns by
 * heart, written out so every dome and round roof on the map has the same clean curve.
 */
const DOME_ROWS: Record<number, readonly number[]> = {
  2: [1, 2],
  3: [2, 3, 3],
  4: [2, 3, 4, 4],
  5: [2, 4, 4, 5, 5],
  6: [3, 4, 5, 6, 6, 6],
  7: [3, 5, 6, 6, 7, 7, 7],
  8: [3, 5, 6, 7, 7, 8, 8, 8],
  9: [4, 6, 7, 8, 8, 9, 9, 9, 9],
  10: [4, 6, 7, 8, 9, 9, 10, 10, 10, 10],
  12: [5, 7, 9, 10, 10, 11, 11, 12, 12, 12, 12, 12],
  14: [5, 8, 10, 11, 12, 12, 13, 13, 14, 14, 14, 14, 14, 14],
  16: [6, 9, 11, 12, 13, 14, 14, 15, 15, 16, 16, 16, 16, 16, 16, 16],
  20: [7, 10, 12, 14, 15, 16, 17, 18, 18, 19, 19, 19, 20, 20, 20, 20, 20, 20, 20, 20],
}

/**
 * A dome `2 * r` pixels wide with its top at row `y` and its middle between columns `cx` and `cx + 1`: lit
 * from the top-left, with a highlight near the top, the lit tone over the left and middle, and shade down
 * the right side and along the bottom-right.
 */
export function dome(a: Art, cx: number, y: number, r: number, ramp: Ramp) {
  const widths = DOME_ROWS[r]
  if (!widths) throw new Error(`dome: no rows for radius ${r}`)
  for (let j = 0; j < widths.length; j++) {
    const half = widths[j]
    for (let i = -half + 1; i <= half; i++) {
      const t = (i + half) / (half * 2)
      let c = ramp[1]
      if (t > 0.86 || (t > 0.72 && j > widths.length * 0.5)) c = ramp[3]
      else if (t > 0.62) c = ramp[2]
      else if (j <= Math.max(1, r >> 2) + 1 && j >= 1 && t > 0.22 && t < 0.42) c = ramp[0]
      a.set(cx + i, y + j, c)
    }
  }
}

/**
 * A cone or tent `w` pixels wide at the bottom and `h` tall, its point `top` pixels wide: the left third in
 * the highlight, then the lit tone, then shade on the right. With `fringe`, the bottom row is the ragged edge
 * of a thatch.
 */
export function cone(
  a: Art,
  cx: number,
  y: number,
  w: number,
  h: number,
  ramp: Ramp,
  top = 2,
  fringe = true,
) {
  for (let j = 0; j < h; j++) {
    const full = top + ((w - top) * j) / Math.max(1, h - 1)
    const half = Math.max(1, Math.round(full / 2))
    for (let i = -half + 1; i <= half; i++) {
      const t = (i + half - 0.5) / (half * 2)
      let c = t < 0.3 ? ramp[0] : t < 0.62 ? ramp[1] : t < 0.86 ? ramp[2] : ramp[3]
      if (fringe && j === h - 1) c = (i + half) % 3 === 1 ? ramp[2] : ramp[3]
      a.set(cx + i, y + j, c)
    }
  }
}

/**
 * A round tower or drum from the front: a column `w` wide and `h` tall, the left edge lit, the right third in
 * shade.
 */
export function drum(a: Art, x: number, y: number, w: number, h: number, ramp: Ramp) {
  const shade = Math.max(1, Math.round(w * 0.3))
  a.rect(x, y, w, h, ramp[1])
  a.vline(x, y, h, ramp[0])
  a.rect(x + w - shade, y, shade, h, ramp[2])
  a.vline(x + w - 1, y, h, ramp[3])
}

/** A box seen from the front with a lit top edge, a shaded right edge and a darker foot. */
export function block(a: Art, x: number, y: number, w: number, h: number, ramp: Ramp) {
  a.rect(x, y, w, h, ramp[1])
  a.hline(x, y, w, ramp[0])
  a.vline(x + w - 1, y + 1, h - 1, ramp[2])
  a.hline(x, y + h - 1, w, ramp[2])
}

/** The battlements along the top of a wall: merlons `mw` wide with gaps of the same width. */
export function battlements(a: Art, x: number, y: number, w: number, ramp: Ramp, mw = 2) {
  for (let i = 0; i < w; i++) {
    const merlon = Math.floor(i / mw) % 2 === 0
    if (merlon) {
      a.set(x + i, y, ramp[0])
      a.set(x + i, y + 1, ramp[1])
    }
  }
}

/** A stepped pyramid or stair: `steps` tiers, each `rise` tall and `run` narrower on each side than the one below. */
export function steps(
  a: Art,
  x: number,
  y: number,
  w: number,
  n: number,
  rise: number,
  run: number,
  ramp: Ramp,
) {
  for (let s = 0; s < n; s++) {
    const inset = (n - 1 - s) * run
    const sw = w - inset * 2
    const sy = y + s * rise
    a.rect(x + inset, sy, sw, rise, ramp[1])
    a.hline(x + inset, sy, sw, ramp[0])
    a.rect(x + inset + sw - Math.max(1, run), sy + 1, Math.max(1, run), rise - 1, ramp[2])
  }
}
