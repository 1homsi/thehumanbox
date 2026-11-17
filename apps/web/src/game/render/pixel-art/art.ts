import { INK } from './palette.ts'

/** What a letter in a stamp means: a palette index per character. `.` and a space always mean "no pixel". */
export type Legend = Readonly<Record<string, number>>

/**
 * A sprite being drawn: a grid of palette indexes (0 is empty). Everything is whole pixels at whole
 * coordinates; there are no curves, no blending and no scaling, so what is drawn is exactly what shows.
 */
export class Art {
  readonly w: number
  readonly h: number
  readonly px: Uint8Array

  constructor(w: number, h: number) {
    this.w = w
    this.h = h
    this.px = new Uint8Array(w * h)
  }

  get(x: number, y: number): number {
    return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.px[y * this.w + x]
  }

  set(x: number, y: number, c: number): this {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y * this.w + x] = c
    return this
  }

  rect(x: number, y: number, w: number, h: number, c: number): this {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c)
    return this
  }

  hline(x: number, y: number, n: number, c: number): this {
    return this.rect(x, y, n, 1, c)
  }

  vline(x: number, y: number, n: number, c: number): this {
    return this.rect(x, y, 1, n, c)
  }

  /** Every `step`-th pixel of a row, from `x`: a dashed line, a row of posts, a course of joints. */
  dots(x: number, y: number, n: number, step: number, c: number): this {
    for (let i = 0; i < n; i += step) this.set(x + i, y, c)
    return this
  }

  /** Draws rows of text with their top-left at (x, y); each character is one pixel, looked up in `legend`. */
  stamp(rows: readonly string[], x: number, y: number, legend: Legend): this {
    for (let j = 0; j < rows.length; j++) {
      const row = rows[j]
      for (let i = 0; i < row.length; i++) {
        const ch = row[i]
        if (ch === '.' || ch === ' ') continue
        const c = legend[ch]
        if (c === undefined) throw new Error(`stamp: no colour for '${ch}' in "${row}"`)
        this.set(x + i, y + j, c)
      }
    }
    return this
  }

  /** Another sprite drawn over this one, its top-left at (x, y); its empty pixels leave this one alone. */
  blit(src: Art, x: number, y: number): this {
    for (let j = 0; j < src.h; j++)
      for (let i = 0; i < src.w; i++) {
        const c = src.px[j * src.w + i]
        if (c) this.set(x + i, y + j, c)
      }
    return this
  }

  /** Recolours every pixel of colour `from` inside the rectangle. */
  swap(from: number, to: number, x = 0, y = 0, w = this.w, h = this.h): this {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (this.get(i, j) === from) this.set(i, j, to)
    return this
  }

  /** The ink line round the silhouette: every empty pixel beside a drawn one (not diagonally) is inked. */
  outline(c: number = INK): this {
    const add: number[] = []
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (this.px[y * this.w + x]) continue
        if (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1))
          add.push(y * this.w + x)
      }
    for (const i of add) this.px[i] = c
    return this
  }

  /** The drawn pixels' bounding box, or null for an empty sprite. */
  bounds(): { x0: number; y0: number; x1: number; y1: number } | null {
    let x0 = this.w
    let x1 = -1
    let y0 = this.h
    let y1 = -1
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++)
        if (this.px[y * this.w + x]) {
          if (x < x0) x0 = x
          if (x > x1) x1 = x
          if (y < y0) y0 = y
          if (y > y1) y1 = y
        }
    return x1 < 0 ? null : { x0, y0, x1, y1 }
  }

  /** A copy cut down to the drawn pixels. */
  trim(): Art {
    const b = this.bounds()
    if (!b) return new Art(1, 1)
    const out = new Art(b.x1 - b.x0 + 1, b.y1 - b.y0 + 1)
    for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) out.px[y * out.w + x] = this.get(b.x0 + x, b.y0 + y)
    return out
  }
}

/** Checks that every row of a stamp is the same width, so a slipped row is caught where it was typed. */
export function rows(name: string, ...lines: string[]): readonly string[] {
  const w = lines[0].length
  for (let i = 0; i < lines.length; i++)
    if (lines[i].length !== w) throw new Error(`${name}: row ${i} is ${lines[i].length} wide, not ${w}: "${lines[i]}"`)
  return lines
}
