/**
 * A recording stand-in for a 2D context: it runs a tile painter without rasterising
 * and reports whether anything was drawn and how far the marks reach, so a world's
 * decorations can be found (and sized for the atlas) without painting 180k tiles.
 * Only the calls the decoration painters use are implemented.
 *
 * It also keeps a signature of everything drawn since the last reset: two tiles with the same signature
 * made the same calls with the same arguments, so they paint the same pixels and can share one baked cell.
 */
export interface DrawProbe {
  ctx: CanvasRenderingContext2D
  /** Anything drawn since the last reset. */
  drew: boolean
  /** Bounding box of the marks in painter coordinates (stroke width included). */
  x0: number
  y0: number
  x1: number
  y1: number
  /** A key of every call and value since the last reset (two 32-bit hashes, so a collision is negligible). */
  signature(): string
  reset(): void
}

export function createProbe(): DrawProbe {
  const probe = { drew: false, x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity } as DrawProbe
  let lineWidth = 1
  let h1 = 0
  let h2 = 0
  // Fold a number into both hashes (different multipliers so they are not the same function of the input).
  const mix = (v: number) => {
    const i = Math.round(v * 1024) | 0
    h1 = Math.imul(h1 ^ i, 0x9e3779b1) + 0x7f4a7c15
    h1 ^= h1 >>> 15
    h2 = Math.imul(h2 + i, 0x85ebca6b) ^ 0x165667b1
    h2 ^= h2 >>> 13
  }
  const mixString = (str: string) => {
    for (let k = 0; k < str.length; k++) mix(str.charCodeAt(k))
    mix(str.length)
  }
  let fillStyle = ''
  let strokeStyle = ''
  const grow = (x0: number, y0: number, x1: number, y1: number) => {
    probe.drew = true
    if (x0 < probe.x0) probe.x0 = x0
    if (y0 < probe.y0) probe.y0 = y0
    if (x1 > probe.x1) probe.x1 = x1
    if (y1 > probe.y1) probe.y1 = y1
  }
  // Path points are kept until stroke()/fill() so their extent counts only when drawn.
  let px0 = Infinity
  let py0 = Infinity
  let px1 = -Infinity
  let py1 = -Infinity
  const point = (x: number, y: number) => {
    if (x < px0) px0 = x
    if (y < py0) py0 = y
    if (x > px1) px1 = x
    if (y > py1) py1 = y
  }
  const ctx = {
    set fillStyle(v: string) {
      fillStyle = v
      mix(1)
      mixString(String(v))
    },
    get fillStyle() {
      return fillStyle
    },
    set strokeStyle(v: string) {
      strokeStyle = v
      mix(2)
      mixString(String(v))
    },
    get strokeStyle() {
      return strokeStyle
    },
    set lineWidth(v: number) {
      lineWidth = v
      mix(3)
      mix(v)
    },
    get lineWidth() {
      return lineWidth
    },
    fillRect(x: number, y: number, w: number, h: number) {
      mix(4)
      mix(x)
      mix(y)
      mix(w)
      mix(h)
      grow(x, y, x + w, y + h)
    },
    beginPath() {
      mix(5)
      px0 = py0 = Infinity
      px1 = py1 = -Infinity
    },
    moveTo(x: number, y: number) {
      mix(6)
      mix(x)
      mix(y)
      point(x, y)
    },
    lineTo(x: number, y: number) {
      mix(7)
      mix(x)
      mix(y)
      point(x, y)
    },
    arc(x: number, y: number, r: number, a0?: number, a1?: number) {
      mix(8)
      mix(x)
      mix(y)
      mix(r)
      mix(a0 ?? 0)
      mix(a1 ?? 0)
      point(x - r, y - r)
      point(x + r, y + r)
    },
    ellipse(x: number, y: number, rx: number, ry: number, rot?: number, a0?: number, a1?: number) {
      mix(9)
      mix(x)
      mix(y)
      mix(rx)
      mix(ry)
      mix(rot ?? 0)
      mix(a0 ?? 0)
      mix(a1 ?? 0)
      point(x - rx, y - ry)
      point(x + rx, y + ry)
    },
    fill() {
      mix(10)
      if (px1 >= px0) grow(px0, py0, px1, py1)
    },
    stroke() {
      mix(11)
      if (px1 >= px0) grow(px0 - lineWidth, py0 - lineWidth, px1 + lineWidth, py1 + lineWidth)
    },
  }
  probe.ctx = ctx as unknown as CanvasRenderingContext2D
  probe.signature = () => `${(h1 >>> 0).toString(36)}.${(h2 >>> 0).toString(36)}`
  probe.reset = () => {
    h1 = 0x1234567
    h2 = 0x7654321
    probe.drew = false
    probe.x0 = probe.y0 = Infinity
    probe.x1 = probe.y1 = -Infinity
  }
  return probe
}
