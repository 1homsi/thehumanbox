import { atlasId, makeCanvas, type AtlasHost } from './atlas-host'
import { parseColor } from './color'

/** One baked cell is CELL x CELL texels; the shape fills a disc of radius FILL inside it. */
export const CELL = 128
export const FILL = 62
const COLS = 8
const ROWS = 8
const CAPACITY = COLS * ROWS

export interface GradientStop {
  offset: number
  color: string
}

/** Frame 0 is a filled disc; everything else is baked on first use. */
export const FRAME_DISC = 0

/**
 * A texture atlas of the few shapes the canvas painters draw with paths and gradients (discs,
 * rings, radial and linear gradients), baked once into a dynamic canvas that SpriteLayers sample.
 * Sprites tint it with `color`, so one baked frame serves every colour; gradients are baked
 * with their alpha normalised, and the sprite's alpha carries the strength.
 */
export class ShapeAtlas {
  readonly id = atlasId('shapes')
  readonly canvas = makeCanvas(CELL * COLS, CELL * ROWS)
  readonly cell = CELL
  readonly cols = COLS
  private readonly ctx = this.canvas.getContext('2d')
  private readonly frames = new Map<string, number>()
  private readonly order: string[] = []
  private next = 1
  bakes = 0

  private readonly host: AtlasHost

  constructor(host: AtlasHost) {
    this.host = host
    host.register(this.id, this.canvas)
    this.paint(FRAME_DISC, (g) => {
      g.fillStyle = '#fff'
      g.beginPath()
      g.arc(CELL / 2, CELL / 2, FILL, 0, Math.PI * 2)
      g.fill()
    })
  }

  dispose(): void {
    this.host.unregister(this.id)
  }

  /** Atlas definition for a SpriteLayer. */
  layerAtlas() {
    return { dynamicSrc: this.id, frameWidth: CELL, frameHeight: CELL, frameColumns: COLS }
  }

  private paint(frame: number, draw: (g: CanvasRenderingContext2D) => void): void {
    const g = this.ctx
    if (!g) return
    const x = (frame % COLS) * CELL
    const y = Math.floor(frame / COLS) * CELL
    g.save()
    g.beginPath()
    g.rect(x, y, CELL, CELL)
    g.clip()
    g.clearRect(x, y, CELL, CELL)
    g.translate(x, y)
    draw(g)
    g.restore()
    this.host.dirty(this.id, x, y, CELL, CELL)
    this.bakes++
  }

  private frameFor(key: string, draw: (g: CanvasRenderingContext2D) => void): number {
    const hit = this.frames.get(key)
    if (hit !== undefined) return hit
    let frame: number
    if (this.next < CAPACITY) frame = this.next++
    else {
      // Full: recycle the oldest baked frame (the disc at 0 is never evicted).
      const old = this.order.shift()!
      frame = this.frames.get(old)!
      this.frames.delete(old)
    }
    this.frames.set(key, frame)
    this.order.push(key)
    this.paint(frame, draw)
    return frame
  }

  /**
   * A ring: outer radius FILL, wall `thickness` (0..1 of the outer radius), squashed to `aspect`
   * vertically (an ellipse ring). Thickness is bucketed so animated radii reuse frames.
   */
  ring(thickness: number, aspect = 1): number {
    const t = bucketThickness(thickness)
    const a = Math.round(aspect * 20) / 20
    return this.frameFor(`ring|${t}|${a}`, (g) => {
      g.strokeStyle = '#fff'
      g.lineWidth = Math.max(1, FILL * t)
      g.beginPath()
      const ry = FILL * a
      g.ellipse(CELL / 2, CELL / 2, FILL - g.lineWidth / 2, Math.max(0.5, ry - g.lineWidth / 2), 0, 0, Math.PI * 2)
      g.stroke()
    })
  }

  /**
   * A radial gradient from `inner` (0..1 of the outer radius) outwards through `stops`, clipped to
   * an ellipse of vertical squash `aspect`. Returns the frame and the alpha to tint the sprite
   * with (the stops are baked relative to their strongest alpha).
   */
  radial(stops: readonly GradientStop[], inner: number, aspect = 1): { frame: number; alpha: number } {
    const { norm, alpha, key } = normalise(stops)
    const a = Math.round(aspect * 20) / 20
    const i = Math.round(inner * 20) / 20
    const frame = this.frameFor(`rad|${i}|${a}|${key}`, (g) => {
      const grad = g.createRadialGradient(CELL / 2, CELL / 2, FILL * i, CELL / 2, CELL / 2, FILL)
      for (const s of norm) grad.addColorStop(s.offset, s.css)
      g.fillStyle = grad
      g.beginPath()
      g.ellipse(CELL / 2, CELL / 2, FILL, FILL * a, 0, 0, Math.PI * 2)
      g.fill()
    })
    return { frame, alpha }
  }

  /**
   * A feathered line: full-width, with alpha rising to the middle row and back to zero at the
   * edges. A sprite twice as tall as the line is wide covers the same area as an anti-aliased
   * canvas stroke, which a plain rotated quad (no multisampling) cannot.
   */
  softLine(): number {
    return this.frameFor('softline', (g) => {
      const grad = g.createLinearGradient(0, 0, 0, CELL)
      grad.addColorStop(0, 'rgba(255,255,255,0)')
      grad.addColorStop(0.5, 'rgba(255,255,255,1)')
      grad.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = grad
      g.fillRect(0, 0, CELL, CELL)
    })
  }

  /** A horizontal linear gradient across the whole cell (rotate/scale the sprite to place it). */
  linear(stops: readonly GradientStop[]): { frame: number; alpha: number } {
    const { norm, alpha, key } = normalise(stops)
    const frame = this.frameFor(`lin|${key}`, (g) => {
      const grad = g.createLinearGradient(0, 0, CELL, 0)
      for (const s of norm) grad.addColorStop(s.offset, s.css)
      g.fillStyle = grad
      g.fillRect(0, 0, CELL, CELL)
    })
    return { frame, alpha }
  }
}

const RING_BUCKETS = [0.03, 0.05, 0.08, 0.12, 0.18, 0.27, 0.4, 0.6, 1]
function bucketThickness(t: number): number {
  for (const b of RING_BUCKETS) if (t <= b * 1.15) return b
  return 1
}

function normalise(stops: readonly GradientStop[]): {
  norm: { offset: number; css: string }[]
  alpha: number
  key: string
} {
  let max = 0
  const parsed = stops.map((s) => {
    const c = parseColor(s.color)
    if (c.a > max) max = c.a
    return { offset: s.offset, c }
  })
  const scale = max > 0 ? 1 / max : 1
  const norm = parsed.map((p) => ({
    offset: Math.round(p.offset * 100) / 100,
    css: `rgba(${p.c.r},${p.c.g},${p.c.b},${(Math.round(p.c.a * scale * 32) / 32).toFixed(3)})`,
  }))
  return { norm, alpha: max, key: norm.map((s) => `${s.offset}:${s.css}`).join(';') }
}
