import { atlasId, makeCanvas, type AtlasHost } from './atlas-host'

export type Weight = 'normal' | 'bold'

/** Atlas font sizes (texels per em). A label picks the smallest one that still covers its on-screen size. */
export const GLYPH_BUCKETS = [9, 14, 22, 36] as const

const COLS = 16
const ROWS = 10
const CAPACITY = COLS * ROWS
const PAD = 2

/** Ratios measured once from a 100px monospace face so any size can place text without measuring it again. */
export interface FontMetrics {
  /** Advance width per em. */
  advance: number
  /** Distance from the top of the em square to the alphabetic baseline, per em. */
  ascent: number
  /** Distance from the baseline to the bottom of the em square, per em. */
  descent: number
}

let measured: FontMetrics | null = null
let measuredBold: FontMetrics | null = null

export function fontMetrics(weight: Weight): FontMetrics {
  const cached = weight === 'bold' ? measuredBold : measured
  if (cached) return cached
  let m: FontMetrics = { advance: 0.6, ascent: 0.8, descent: 0.2 }
  try {
    const g = makeCanvas(8, 8).getContext('2d')
    if (g) {
      g.font = `${weight === 'bold' ? 'bold ' : ''}100px monospace`
      const t = g.measureText('M')
      if (t.width > 0) {
        m = {
          advance: t.width / 100,
          ascent: (t.emHeightAscent ?? t.fontBoundingBoxAscent ?? 80) / 100,
          descent: (t.emHeightDescent ?? t.fontBoundingBoxDescent ?? 20) / 100,
        }
      }
    }
  } catch {
    /* keep defaults */
  }
  if (weight === 'bold') measuredBold = m
  else measured = m
  return m
}

/** One font weight at one atlas size: a grid of glyphs baked in white on first use. */
export class GlyphAtlas {
  readonly id = atlasId('glyphs')
  readonly cellW: number
  readonly cellH: number
  readonly canvas: HTMLCanvasElement
  readonly metrics: FontMetrics
  private readonly ctx: CanvasRenderingContext2D | null
  private readonly frames = new Map<string, number>()
  private next = 0
  bakes = 0
  /** Glyphs that did not fit (the atlas is full): they draw as blanks. */
  overflow = 0

  private readonly host: AtlasHost
  readonly weight: Weight
  readonly px: number

  constructor(host: AtlasHost, weight: Weight, px: number) {
    this.host = host
    this.weight = weight
    this.px = px
    this.metrics = fontMetrics(weight)
    this.cellW = Math.ceil(this.metrics.advance * px) + PAD * 2
    this.cellH = Math.ceil((this.metrics.ascent + this.metrics.descent) * px * 1.25) + PAD * 2
    this.canvas = makeCanvas(this.cellW * COLS, this.cellH * ROWS)
    this.ctx = this.canvas.getContext('2d')
    host.register(this.id, this.canvas)
  }

  dispose(): void {
    this.host.unregister(this.id)
  }

  layerAtlas() {
    return { dynamicSrc: this.id, frameWidth: this.cellW, frameHeight: this.cellH, frameColumns: COLS }
  }

  /** Frame index of a character, baking it if new; -1 when the atlas is full. */
  frame(ch: string): number {
    const hit = this.frames.get(ch)
    if (hit !== undefined) return hit
    if (this.next >= CAPACITY) {
      this.overflow++
      return -1
    }
    const frame = this.next++
    this.frames.set(ch, frame)
    const g = this.ctx
    if (g) {
      const x = (frame % COLS) * this.cellW
      const y = Math.floor(frame / COLS) * this.cellH
      g.save()
      g.beginPath()
      g.rect(x, y, this.cellW, this.cellH)
      g.clip()
      g.font = `${this.weight === 'bold' ? 'bold ' : ''}${this.px}px monospace`
      g.fillStyle = '#fff'
      g.textAlign = 'left'
      g.textBaseline = 'alphabetic'
      // The cell's em square starts PAD below its top; the baseline sits `ascent` below that.
      g.fillText(ch, x + PAD, y + PAD + this.metrics.ascent * this.px)
      g.restore()
      this.host.dirty(this.id, x, y, this.cellW, this.cellH)
    }
    this.bakes++
    return frame
  }
}

/** The four sizes of both weights, in the order a text SpriteLayer lists them as atlases. */
export class GlyphSet {
  readonly atlases: GlyphAtlas[] = []

  constructor(host: AtlasHost) {
    for (const weight of ['normal', 'bold'] as const)
      for (const px of GLYPH_BUCKETS) this.atlases.push(new GlyphAtlas(host, weight, px))
  }

  dispose(): void {
    for (const a of this.atlases) a.dispose()
  }

  layerAtlases() {
    return this.atlases.map((a) => a.layerAtlas())
  }

  /** Index into `atlases` for a weight and an on-screen em size in device pixels. */
  pick(weight: Weight, screenPx: number): number {
    let b = GLYPH_BUCKETS.length - 1
    for (let i = 0; i < GLYPH_BUCKETS.length; i++) {
      if (GLYPH_BUCKETS[i] >= screenPx) {
        b = i
        break
      }
    }
    return (weight === 'bold' ? GLYPH_BUCKETS.length : 0) + b
  }

  get bakes(): number {
    return this.atlases.reduce((n, a) => n + a.bakes, 0)
  }
}
