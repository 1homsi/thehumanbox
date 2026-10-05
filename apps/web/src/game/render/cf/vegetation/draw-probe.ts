/**
 * A recording stand-in for a 2D context: it runs a tile painter without rasterising
 * and reports whether anything was drawn and how far the marks reach, so a world's
 * decorations can be found (and sized for the atlas) without painting 180k tiles.
 * Only the calls the decoration painters use are implemented.
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
  reset(): void
}

export function createProbe(): DrawProbe {
  const probe = { drew: false, x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity } as DrawProbe
  let lineWidth = 1
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
    fillStyle: '',
    strokeStyle: '',
    set lineWidth(v: number) {
      lineWidth = v
    },
    get lineWidth() {
      return lineWidth
    },
    fillRect(x: number, y: number, w: number, h: number) {
      grow(x, y, x + w, y + h)
    },
    beginPath() {
      px0 = py0 = Infinity
      px1 = py1 = -Infinity
    },
    moveTo: point,
    lineTo: point,
    arc(x: number, y: number, r: number) {
      point(x - r, y - r)
      point(x + r, y + r)
    },
    ellipse(x: number, y: number, rx: number, ry: number) {
      point(x - rx, y - ry)
      point(x + rx, y + ry)
    },
    fill() {
      if (px1 >= px0) grow(px0, py0, px1, py1)
    },
    stroke() {
      if (px1 >= px0) grow(px0 - lineWidth, py0 - lineWidth, px1 + lineWidth, py1 + lineWidth)
    },
  }
  probe.ctx = ctx as unknown as CanvasRenderingContext2D
  probe.reset = () => {
    probe.drew = false
    probe.x0 = probe.y0 = Infinity
    probe.x1 = probe.y1 = -Infinity
  }
  return probe
}
