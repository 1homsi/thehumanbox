import { SPRITE_UNTEXTURED, type SpriteLayer } from 'xipjs'
import { packRgba, parseColor } from './color'
import { CELL, FILL, FRAME_DISC, type GradientStop, type ShapeAtlas } from './shape-atlas'
import { fontMetrics, type GlyphSet, type Weight } from './glyph-atlas'

/** Texel-to-world factor for a baked disc: the sprite's quad is the whole cell, the disc fills FILL of CELL/2. */
const DISC_SPAN = CELL / 2 / FILL

export class RecGradient {
  readonly stops: GradientStop[] = []
  readonly kind: 'radial' | 'linear'
  readonly x0: number
  readonly y0: number
  readonly r0: number
  readonly x1: number
  readonly y1: number
  readonly r1: number

  constructor(
    kind: 'radial' | 'linear',
    x0: number,
    y0: number,
    r0: number,
    x1: number,
    y1: number,
    r1: number,
  ) {
    this.kind = kind
    this.x0 = x0
    this.y0 = y0
    this.r0 = r0
    this.x1 = x1
    this.y1 = y1
    this.r1 = r1
  }
  addColorStop(offset: number, color: string): void {
    this.stops.push({ offset, color })
  }
}

type Paint = string | RecGradient

interface Snapshot {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
  fillStyle: Paint
  strokeStyle: Paint
  globalAlpha: number
  lineWidth: number
  lineCap: string
  font: string
  textAlign: string
  textBaseline: string
}

export interface RecorderStats {
  rects: number
  shapes: number
  glyphs: number
  /** Canvas calls the shim could not express as sprites, by name. */
  unsupported: Record<string, number>
}

export interface RecorderView {
  /** Camera zoom and device pixel ratio: pick glyph atlas sizes that cover the on-screen size. */
  zoom: number
  dpr: number
}

type PathItem =
  | { k: 'rect'; x: number; y: number; w: number; h: number }
  | { k: 'ellipse'; cx: number; cy: number; rx: number; ry: number; rot: number }
  | { k: 'poly'; pts: number[]; closed: boolean }

const FONT_RE = /^(?:(?:italic|oblique)\s+)?(bold|\d{3})?\s*(\d+(?:\.\d+)?)px/

/**
 * A stand-in for `CanvasRenderingContext2D` that records what the existing painters draw as
 * xipjs sprites instead of rasterising it. The painters stay the single source of truth for
 * the art; the engine batches the result on the GPU.
 *
 * Supported: fillRect/strokeRect, transforms (translate/scale/rotate/setTransform), globalAlpha,
 * paths made of rect/arc(full circle)/ellipse/lineTo, fill and stroke of them, radial and linear
 * gradients, fillText/measureText (monospace). Anything else is counted in `stats.unsupported`.
 */
export class SpriteRecorder {
  fillStyle: Paint = '#000'
  strokeStyle: Paint = '#000'
  globalAlpha = 1
  lineWidth = 1
  lineCap = 'butt'
  lineJoin = 'miter'
  font = '10px monospace'
  textAlign = 'start'
  textBaseline = 'alphabetic'
  imageSmoothingEnabled = false
  shadowBlur = 0
  shadowColor = 'transparent'

  readonly stats: RecorderStats = { rects: 0, shapes: 0, glyphs: 0, unsupported: {} }

  private a = 1
  private b = 0
  private c = 0
  private d = 1
  private e = 0
  private f = 0
  private readonly stack: Snapshot[] = []
  private depth = 0
  private path: PathItem[] = []
  private view: RecorderView = { zoom: 1, dpr: 1 }
  private fontCache = new Map<string, { size: number; weight: Weight }>()

  private readonly shapeLayer: SpriteLayer
  private readonly textLayer: SpriteLayer
  private readonly shapes: ShapeAtlas
  private readonly glyphs: GlyphSet

  constructor(shapeLayer: SpriteLayer, textLayer: SpriteLayer, shapes: ShapeAtlas, glyphs: GlyphSet) {
    this.shapeLayer = shapeLayer
    this.textLayer = textLayer
    this.shapes = shapes
    this.glyphs = glyphs
  }

  /** Start a frame: forget last frame's sprites and reset the canvas state. */
  begin(view: RecorderView): void {
    this.view = view
    this.shapeLayer.clear()
    this.textLayer.clear()
    this.a = 1
    this.b = 0
    this.c = 0
    this.d = 1
    this.e = 0
    this.f = 0
    this.depth = 0
    this.path = []
    this.fillStyle = '#000'
    this.strokeStyle = '#000'
    this.globalAlpha = 1
    this.lineWidth = 1
    this.lineCap = 'butt'
    this.font = '10px monospace'
    this.textAlign = 'start'
    this.textBaseline = 'alphabetic'
    this.stats.rects = 0
    this.stats.shapes = 0
    this.stats.glyphs = 0
  }

  /** Finish a frame: tell the engine the layers changed. */
  end(): void {
    this.shapeLayer.touch()
    this.textLayer.touch()
  }

  get spriteCount(): number {
    return this.shapeLayer.count + this.textLayer.count
  }

  // ── state ──────────────────────────────────────────────────────────────────

  save(): void {
    let s = this.stack[this.depth]
    if (!s) {
      s = {
        a: 1,
        b: 0,
        c: 0,
        d: 1,
        e: 0,
        f: 0,
        fillStyle: '#000',
        strokeStyle: '#000',
        globalAlpha: 1,
        lineWidth: 1,
        lineCap: 'butt',
        font: '',
        textAlign: '',
        textBaseline: '',
      }
      this.stack[this.depth] = s
    }
    this.depth++
    s.a = this.a
    s.b = this.b
    s.c = this.c
    s.d = this.d
    s.e = this.e
    s.f = this.f
    s.fillStyle = this.fillStyle
    s.strokeStyle = this.strokeStyle
    s.globalAlpha = this.globalAlpha
    s.lineWidth = this.lineWidth
    s.lineCap = this.lineCap
    s.font = this.font
    s.textAlign = this.textAlign
    s.textBaseline = this.textBaseline
  }

  restore(): void {
    if (this.depth === 0) return
    const s = this.stack[--this.depth]
    this.a = s.a
    this.b = s.b
    this.c = s.c
    this.d = s.d
    this.e = s.e
    this.f = s.f
    this.fillStyle = s.fillStyle
    this.strokeStyle = s.strokeStyle
    this.globalAlpha = s.globalAlpha
    this.lineWidth = s.lineWidth
    this.lineCap = s.lineCap
    this.font = s.font
    this.textAlign = s.textAlign
    this.textBaseline = s.textBaseline
  }

  translate(x: number, y: number): void {
    this.e += this.a * x + this.c * y
    this.f += this.b * x + this.d * y
  }

  scale(x: number, y: number): void {
    this.a *= x
    this.b *= x
    this.c *= y
    this.d *= y
  }

  rotate(angle: number): void {
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const a = this.a * cos + this.c * sin
    const b = this.b * cos + this.d * sin
    const c = this.c * cos - this.a * sin
    const d = this.d * cos - this.b * sin
    this.a = a
    this.b = b
    this.c = c
    this.d = d
  }

  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.a = a
    this.b = b
    this.c = c
    this.d = d
    this.e = e
    this.f = f
  }

  resetTransform(): void {
    this.setTransform(1, 0, 0, 1, 0, 0)
  }

  // ── rectangles ─────────────────────────────────────────────────────────────

  fillRect(x: number, y: number, w: number, h: number): void {
    this.emitRect(x, y, w, h, this.fillStyle)
  }

  clearRect(): void {
    /* painters only clear scratch canvases; nothing to do for sprites */
  }

  strokeRect(x: number, y: number, w: number, h: number): void {
    const lw = this.lineWidth
    const hw = lw / 2
    const paint = this.strokeStyle
    this.emitRect(x - hw, y - hw, w + lw, lw, paint)
    this.emitRect(x - hw, y + h - hw, w + lw, lw, paint)
    this.emitRect(x - hw, y + hw, lw, h - lw, paint)
    this.emitRect(x + w - hw, y + hw, lw, h - lw, paint)
  }

  private emitRect(x: number, y: number, w: number, h: number, paint: Paint): void {
    if (w === 0 || h === 0) return
    if (typeof paint !== 'string') {
      this.emitGradientRect(x, y, w, h, paint)
      return
    }
    const col = parseColor(paint)
    const alpha = col.a * this.globalAlpha
    if (alpha <= 0) return
    this.pushUntextured(x + w / 2, y + h / 2, w, h, 0, packRgba(col.r, col.g, col.b, alpha))
  }

  /** An untextured quad centred at local (cx, cy) with local size (w, h), under the current transform. */
  private pushUntextured(cx: number, cy: number, w: number, h: number, rot: number, color: number): void {
    const { a, b, c, d } = this
    const layer = this.shapeLayer
    const i = layer.add(a * cx + c * cy + this.e, b * cx + d * cy + this.f, 0, 0)
    layer.w[i] = Math.abs(w) * Math.hypot(a, b)
    layer.h[i] = Math.abs(h) * Math.hypot(c, d)
    layer.rotation[i] = rot + Math.atan2(b, a)
    layer.color[i] = color
    layer.flags[i] = SPRITE_UNTEXTURED
    this.stats.rects++
  }

  /**
   * An untextured quad in layer pixels, no transform: what a painter that works out its own geometry (the work
   * poses) writes instead of going through the canvas calls. Colour is packed 0xRRGGBBAA.
   */
  solid(cx: number, cy: number, w: number, h: number, rotation: number, color: number): void {
    const layer = this.shapeLayer
    const i = layer.add(cx, cy, 0, 0)
    layer.w[i] = w
    layer.h[i] = h
    layer.rotation[i] = rotation
    layer.color[i] = color
    layer.flags[i] = SPRITE_UNTEXTURED
    this.stats.rects++
  }

  private pushShape(
    cx: number,
    cy: number,
    w: number,
    h: number,
    rot: number,
    frame: number,
    color: number,
  ): void {
    const { a, b, c, d } = this
    const layer = this.shapeLayer
    const i = layer.add(a * cx + c * cy + this.e, b * cx + d * cy + this.f, 0, 0, frame)
    layer.w[i] = Math.abs(w) * Math.hypot(a, b)
    layer.h[i] = Math.abs(h) * Math.hypot(c, d)
    layer.rotation[i] = rot + Math.atan2(b, a)
    layer.color[i] = color
    this.stats.shapes++
  }

  // ── paths ──────────────────────────────────────────────────────────────────

  beginPath(): void {
    this.path.length = 0
  }

  closePath(): void {
    const last = this.path[this.path.length - 1]
    if (last && last.k === 'poly') last.closed = true
  }

  moveTo(x: number, y: number): void {
    this.path.push({ k: 'poly', pts: [x, y], closed: false })
  }

  lineTo(x: number, y: number): void {
    const last = this.path[this.path.length - 1]
    if (last && last.k === 'poly') last.pts.push(x, y)
    else this.path.push({ k: 'poly', pts: [x, y], closed: false })
  }

  rect(x: number, y: number, w: number, h: number): void {
    this.path.push({ k: 'rect', x, y, w, h })
  }

  arc(x: number, y: number, r: number, a0: number, a1: number): void {
    if (Math.abs(a1 - a0) < Math.PI * 2 - 1e-6) {
      this.unsupported('arc(partial)')
      return
    }
    this.path.push({ k: 'ellipse', cx: x, cy: y, rx: r, ry: r, rot: 0 })
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, rot: number, a0: number, a1: number): void {
    if (Math.abs(a1 - a0) < Math.PI * 2 - 1e-6) {
      this.unsupported('ellipse(partial)')
      return
    }
    this.path.push({ k: 'ellipse', cx, cy, rx, ry, rot })
  }

  fill(): void {
    const paint = this.fillStyle
    for (const item of this.path) {
      if (item.k === 'rect') this.emitRect(item.x, item.y, item.w, item.h, paint)
      else if (item.k === 'ellipse') this.fillEllipse(item, paint)
      else this.unsupported('fill(polygon)')
    }
  }

  stroke(): void {
    const paint = this.strokeStyle
    for (const item of this.path) {
      if (item.k === 'rect') {
        const lw = this.lineWidth
        const hw = lw / 2
        this.emitRect(item.x - hw, item.y - hw, item.w + lw, lw, paint)
        this.emitRect(item.x - hw, item.y + item.h - hw, item.w + lw, lw, paint)
        this.emitRect(item.x - hw, item.y + hw, lw, item.h - lw, paint)
        this.emitRect(item.x + item.w - hw, item.y + hw, lw, item.h - lw, paint)
      } else if (item.k === 'ellipse') this.strokeEllipse(item, paint)
      else this.strokePoly(item, paint)
    }
  }

  private fillEllipse(e: Extract<PathItem, { k: 'ellipse' }>, paint: Paint): void {
    if (typeof paint === 'string') {
      const col = parseColor(paint)
      const alpha = col.a * this.globalAlpha
      if (alpha <= 0) return
      this.pushShape(
        e.cx,
        e.cy,
        e.rx * 2 * DISC_SPAN,
        e.ry * 2 * DISC_SPAN,
        e.rot,
        FRAME_DISC,
        packRgba(col.r, col.g, col.b, alpha),
      )
      return
    }
    if (paint.kind === 'radial' && paint.stops.length > 0) {
      const r1 = paint.r1
      const inner = r1 > 0 ? paint.r0 / r1 : 0
      const aspect = e.rx > 0 ? e.ry / e.rx : 1
      const { frame, alpha } = this.shapes.radial(paint.stops, inner, aspect)
      const size = r1 * 2 * DISC_SPAN
      this.pushShape(
        paint.x1,
        paint.y1,
        size,
        size,
        e.rot,
        frame,
        packRgba(255, 255, 255, alpha * this.globalAlpha),
      )
      return
    }
    this.unsupported('fill(ellipse, linear gradient)')
  }

  private strokeEllipse(e: Extract<PathItem, { k: 'ellipse' }>, paint: Paint): void {
    if (typeof paint !== 'string') {
      this.unsupported('stroke(gradient)')
      return
    }
    const col = parseColor(paint)
    const alpha = col.a * this.globalAlpha
    if (alpha <= 0) return
    const lw = this.lineWidth
    const outerX = e.rx + lw / 2
    const outerY = e.ry + lw / 2
    const frame = this.shapes.ring(lw / outerX, outerY / outerX)
    const size = outerX * 2 * DISC_SPAN
    this.pushShape(e.cx, e.cy, size, size, e.rot, frame, packRgba(col.r, col.g, col.b, alpha))
  }

  private strokePoly(p: Extract<PathItem, { k: 'poly' }>, paint: Paint): void {
    if (typeof paint !== 'string') {
      this.unsupported('stroke(gradient)')
      return
    }
    const col = parseColor(paint)
    const alpha = col.a * this.globalAlpha
    if (alpha <= 0) return
    const color = packRgba(col.r, col.g, col.b, alpha)
    const lw = this.lineWidth
    const round = this.lineCap === 'round' || this.lineCap === 'square'
    const pts = p.pts
    const n = pts.length / 2
    const segs = p.closed ? n : n - 1
    for (let i = 0; i < segs; i++) {
      const x0 = pts[i * 2]
      const y0 = pts[i * 2 + 1]
      const j = (i + 1) % n
      const x1 = pts[j * 2]
      const y1 = pts[j * 2 + 1]
      const len = Math.hypot(x1 - x0, y1 - y0)
      if (len === 0) continue
      const ext = round ? lw : 0
      const angle = Math.atan2(y1 - y0, x1 - x0)
      const diagonal = Math.abs(Math.sin(angle * 2)) > 1e-3
      if (diagonal && lw <= 3) {
        // A thin slanted line: feather it like the canvas does instead of a hard-edged quad.
        const alpha = Math.min(1, (2 * lw) / (lw + 1)) * col.a * this.globalAlpha
        this.pushShape(
          (x0 + x1) / 2,
          (y0 + y1) / 2,
          len + ext,
          lw + 1,
          angle,
          this.shapes.softLine(),
          packRgba(col.r, col.g, col.b, alpha),
        )
      } else {
        this.pushUntextured((x0 + x1) / 2, (y0 + y1) / 2, len + ext, lw, angle, color)
      }
    }
  }

  // ── gradients ──────────────────────────────────────────────────────────────

  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): RecGradient {
    return new RecGradient('radial', x0, y0, r0, x1, y1, r1)
  }

  createLinearGradient(x0: number, y0: number, x1: number, y1: number): RecGradient {
    return new RecGradient('linear', x0, y0, 0, x1, y1, 0)
  }

  private emitGradientRect(x: number, y: number, w: number, h: number, g: RecGradient): void {
    if (g.stops.length === 0) return
    if (g.kind === 'radial') {
      // The glow is drawn as a square rect that covers the gradient disc: place the disc.
      const inner = g.r1 > 0 ? g.r0 / g.r1 : 0
      const { frame, alpha } = this.shapes.radial(g.stops, inner, 1)
      const size = g.r1 * 2 * DISC_SPAN
      this.pushShape(g.x1, g.y1, size, size, 0, frame, packRgba(255, 255, 255, alpha * this.globalAlpha))
      return
    }
    // Linear gradient along x across (or past) the rect: resample the stops to the rect's span.
    const dx = g.x1 - g.x0
    if (Math.abs(g.y1 - g.y0) > 1e-6 || Math.abs(dx) < 1e-6) {
      this.unsupported('fillRect(angled linear gradient)')
      return
    }
    const t0 = (x - g.x0) / dx
    const t1 = (x + w - g.x0) / dx
    const lo = Math.min(t0, t1)
    const hi = Math.max(t0, t1)
    const span = hi - lo
    if (span <= 0) return
    const colorAt = (t: number): string => {
      const sorted = g.stops
      const tt = Math.max(0, Math.min(1, t))
      let prev = sorted[0]
      for (const s of sorted) {
        if (s.offset >= tt) {
          const pa = parseColor(prev.color)
          const sa = parseColor(s.color)
          const k = s.offset === prev.offset ? 1 : (tt - prev.offset) / (s.offset - prev.offset)
          return `rgba(${Math.round(pa.r + (sa.r - pa.r) * k)},${Math.round(pa.g + (sa.g - pa.g) * k)},${Math.round(pa.b + (sa.b - pa.b) * k)},${pa.a + (sa.a - pa.a) * k})`
        }
        prev = s
      }
      return prev.color
    }
    const stops: GradientStop[] = [{ offset: 0, color: colorAt(t0 <= t1 ? lo : hi) }]
    for (const s of g.stops) {
      if (s.offset > lo && s.offset < hi)
        stops.push({ offset: t0 <= t1 ? (s.offset - lo) / span : (hi - s.offset) / span, color: s.color })
    }
    stops.push({ offset: 1, color: colorAt(t0 <= t1 ? hi : lo) })
    stops.sort((p, q) => p.offset - q.offset)
    const { frame, alpha } = this.shapes.linear(stops)
    this.pushShape(
      x + w / 2,
      y + h / 2,
      w * DISC_SPAN_LINEAR,
      h * DISC_SPAN_LINEAR,
      0,
      frame,
      packRgba(255, 255, 255, alpha * this.globalAlpha),
    )
  }

  // ── text ───────────────────────────────────────────────────────────────────

  private parseFont(): { size: number; weight: Weight } {
    let f = this.fontCache.get(this.font)
    if (!f) {
      const m = FONT_RE.exec(this.font)
      f = {
        size: m ? parseFloat(m[2]) : 10,
        weight: m && m[1] && (m[1] === 'bold' || +m[1] >= 600) ? 'bold' : 'normal',
      }
      this.fontCache.set(this.font, f)
    }
    return f
  }

  measureText(text: string): { width: number } {
    const { size, weight } = this.parseFont()
    return { width: countChars(text) * fontMetrics(weight).advance * size }
  }

  fillText(text: string, x: number, y: number): void {
    if (typeof this.fillStyle !== 'string' || text.length === 0) return
    const { size, weight } = this.parseFont()
    const col = parseColor(this.fillStyle)
    const alpha = col.a * this.globalAlpha
    if (alpha <= 0) return
    const color = packRgba(col.r, col.g, col.b, alpha)
    const m = fontMetrics(weight)
    const scale = Math.hypot(this.a, this.b)
    const worldSize = size * scale
    const atlasIndex = this.glyphs.pick(weight, worldSize * this.view.zoom * this.view.dpr)
    const atlas = this.glyphs.atlases[atlasIndex]
    const k = worldSize / atlas.px
    const adv = m.advance * worldSize
    const total = adv * countChars(text)
    const ox = this.a * x + this.c * y + this.e
    const oy = this.b * x + this.d * y + this.f
    let left = ox
    if (this.textAlign === 'center') left -= total / 2
    else if (this.textAlign === 'right' || this.textAlign === 'end') left -= total
    let baseline = oy
    switch (this.textBaseline) {
      case 'middle':
        baseline += ((m.ascent - m.descent) / 2) * worldSize
        break
      case 'top':
      case 'hanging':
        baseline += m.ascent * worldSize
        break
      case 'bottom':
      case 'ideographic':
        baseline -= m.descent * worldSize
        break
      default:
        break
    }
    const layer = this.textLayer
    const pad = 2 * k
    const cw = atlas.cellW * k
    const ch = atlas.cellH * k
    const top = baseline - m.ascent * worldSize - pad
    let pen = left - pad
    for (const glyph of text) {
      if (glyph !== ' ') {
        const frame = atlas.frame(glyph)
        if (frame >= 0) {
          const i = layer.add(pen + cw / 2, top + ch / 2, cw, ch, frame)
          layer.atlas[i] = atlasIndex
          layer.color[i] = color
          this.stats.glyphs++
        }
      }
      pen += adv
    }
  }

  /**
   * An outline: the text again, in the stroke colour, shifted around the glyphs by half the line
   * width. A name tag's black halo is the one use; the fill goes on top afterwards.
   */
  strokeText(text: string, x: number, y: number): void {
    if (typeof this.strokeStyle !== 'string' || text.length === 0) return
    const r = this.lineWidth / 2
    const d = r * Math.SQRT1_2
    const fill = this.fillStyle
    this.fillStyle = this.strokeStyle
    for (const [dx, dy] of [
      [r, 0],
      [-r, 0],
      [0, r],
      [0, -r],
      [d, d],
      [-d, d],
      [d, -d],
      [-d, -d],
    ])
      this.fillText(text, x + dx, y + dy)
    this.fillStyle = fill
  }

  // ── everything else ────────────────────────────────────────────────────────

  unsupported(name: string): void {
    this.stats.unsupported[name] = (this.stats.unsupported[name] ?? 0) + 1
  }

  /** The recorder typed as a canvas context, for painters. Unknown members count as unsupported and do nothing. */
  asContext(): CanvasRenderingContext2D {
    const target = this as unknown as Record<string | symbol, unknown>
    const count = (name: string) => this.unsupported(name)
    // Methods run against the recorder itself, not the proxy, so their own `this.x` reads skip the
    // trap; the bound copies are made once per name.
    const bound = new Map<string | symbol, unknown>()
    const noops = new Map<string, () => undefined>()
    return new Proxy(target, {
      get(_t, prop) {
        if (prop in target) {
          const value = target[prop]
          if (typeof value !== 'function') return value
          let fn = bound.get(prop)
          if (!fn) {
            fn = (value as (...args: unknown[]) => unknown).bind(target)
            bound.set(prop, fn)
          }
          return fn
        }
        const name = String(prop)
        count(name)
        let noop = noops.get(name)
        if (!noop) {
          noop = () => undefined
          noops.set(name, noop)
        }
        return noop
      },
      set(_t, prop, value) {
        target[prop] = value
        return true
      },
    }) as unknown as CanvasRenderingContext2D
  }
}

function countChars(text: string): number {
  let n = 0
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    // A low surrogate belongs to the high one before it.
    if (c < 0xdc00 || c > 0xdfff) n++
  }
  return n
}

/** A linear-gradient frame fills the whole cell edge to edge, so the sprite is the rect itself. */
const DISC_SPAN_LINEAR = 1
