import type { LayerAtlas } from 'cubeforge'

/** What the atlas needs from one dynamic canvas (see useDynamicCanvas). */
export interface AtlasPage {
  readonly id: string
  readonly canvas: { width: number; height: number }
  readonly ctx: CanvasRenderingContext2D
  markDirty(x?: number, y?: number, width?: number, height?: number): void
}

/** A baked cell: which atlas of the layer it lives in and its frame index. */
export interface CellRef {
  /** Index into the layer's `atlases`; write it to `layer.atlas[i]`. */
  atlas: number
  frame: number
  /** The whole cell, gutter included. A sprite quad covers exactly this size. */
  cw: number
  ch: number
}

/** Transparent border around every cell so NEAREST sampling never reads a neighbour. */
export const CELL_GUTTER = 1

interface PageState {
  /** Cell size of this page (0 until the first cell claims it). */
  cw: number
  ch: number
  cols: number
  capacity: number
  used: number
  keys: string[]
}

/**
 * Packs baked sprites into the textures of one SpriteLayer. SpriteLayer atlases
 * are uniform grids, so every page serves one cell size class, claimed lazily by
 * the first sprite that fits; a full page is cleared and its sprites re-baked on
 * demand (`epoch` changes so callers drop any cell they cached).
 */
export class CellAtlas {
  /** Bumped when a page is cleared: cached CellRefs are no longer valid. */
  epoch = 0
  resets = 0
  bakes = 0
  rejected = 0
  private readonly pages: PageState[]
  private readonly cells = new Map<string, CellRef>()
  private readonly io: readonly AtlasPage[]
  /** Candidate cell sizes (gutter included), smallest first. */
  private readonly classes: ReadonlyArray<readonly [number, number]>
  /** The layer's atlas descriptors, one per page; filled in as pages are claimed. */
  private readonly atlases: LayerAtlas[]

  constructor(
    io: readonly AtlasPage[],
    classes: ReadonlyArray<readonly [number, number]>,
    atlases: LayerAtlas[],
  ) {
    this.io = io
    this.classes = classes
    this.atlases = atlases
    this.pages = io.map(() => ({ cw: 0, ch: 0, cols: 0, capacity: 0, used: 0, keys: [] }))
    io.forEach((page, i) => {
      this.atlases[i] = { dynamicSrc: page.id }
    })
  }

  get(key: string): CellRef | undefined {
    return this.cells.get(key)
  }

  get cellCount(): number {
    return this.cells.size
  }

  /** Cells in use and capacity across claimed pages. */
  usage(): { used: number; capacity: number; pages: number } {
    let used = 0
    let capacity = 0
    let pages = 0
    for (const p of this.pages) {
      if (p.cw === 0) continue
      pages++
      used += p.used
      capacity += p.capacity
    }
    return { used, capacity, pages }
  }

  /**
   * Bake a sprite of `w` x `h` content pixels. `paint` draws with (0,0) at the
   * content's top-left and is clipped to the content rectangle.
   */
  bake(key: string, w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void): CellRef | null {
    const hit = this.cells.get(key)
    if (hit) return hit
    const needW = w + CELL_GUTTER * 2
    const needH = h + CELL_GUTTER * 2
    const index = this.pageFor(needW, needH)
    if (index < 0) {
      this.rejected++
      return null
    }
    let page = this.pages[index]
    if (page.used >= page.capacity) {
      this.clearPage(index)
      page = this.pages[index]
    }
    const slot = page.used++
    page.keys.push(key)
    const col = slot % page.cols
    const row = Math.floor(slot / page.cols)
    const x0 = col * page.cw
    const y0 = row * page.ch
    const { ctx } = this.io[index]
    ctx.save()
    ctx.beginPath()
    ctx.rect(x0, y0, page.cw, page.ch)
    ctx.clip()
    ctx.clearRect(x0, y0, page.cw, page.ch)
    ctx.translate(x0 + CELL_GUTTER, y0 + CELL_GUTTER)
    ctx.beginPath()
    ctx.rect(0, 0, w, h)
    ctx.clip()
    ctx.imageSmoothingEnabled = false
    paint(ctx)
    ctx.restore()
    this.io[index].markDirty(x0, y0, page.cw, page.ch)
    this.bakes++
    const ref: CellRef = { atlas: index, frame: slot, cw: page.cw, ch: page.ch }
    this.cells.set(key, ref)
    return ref
  }

  /** The page that will hold a `needW` x `needH` cell, claiming one if needed. */
  private pageFor(needW: number, needH: number): number {
    let best = -1
    let bestArea = Infinity
    for (let i = 0; i < this.pages.length; i++) {
      const p = this.pages[i]
      if (p.cw === 0 || p.cw < needW || p.ch < needH) continue
      // Prefer the tightest class, then a page that still has room.
      const area = p.cw * p.ch + (p.used >= p.capacity ? 1e9 : 0)
      if (area < bestArea) {
        best = i
        bestArea = area
      }
    }
    // A fitting page that still has room, unless a tighter class could be claimed.
    const klass = this.classes.find(([cw, ch]) => cw >= needW && ch >= needH) ?? [needW, needH]
    if (best >= 0 && this.pages[best].used < this.pages[best].capacity) {
      if (this.pages[best].cw * this.pages[best].ch <= klass[0] * klass[1] * 1.5) return best
    }
    const free = this.pages.findIndex((p) => p.cw === 0)
    if (free >= 0 && this.claim(free, klass[0], klass[1])) return free
    return best
  }

  private claim(index: number, cw: number, ch: number): boolean {
    const { canvas } = this.io[index]
    const cols = Math.floor(canvas.width / cw)
    const rows = Math.floor(canvas.height / ch)
    if (cols < 1 || rows < 1) return false
    const p = this.pages[index]
    p.cw = cw
    p.ch = ch
    p.cols = cols
    p.capacity = cols * rows
    p.used = 0
    p.keys = []
    const at = this.atlases[index]
    at.frameWidth = cw
    at.frameHeight = ch
    at.frameColumns = cols
    return true
  }

  private clearPage(index: number): void {
    const p = this.pages[index]
    for (const k of p.keys) this.cells.delete(k)
    p.keys = []
    p.used = 0
    const { ctx, canvas } = this.io[index]
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    this.io[index].markDirty()
    this.epoch++
    this.resets++
  }
}
