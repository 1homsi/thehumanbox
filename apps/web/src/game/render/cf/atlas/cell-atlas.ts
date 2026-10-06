import type { LayerAtlas } from 'cubeforge'

/** What the atlas needs from one dynamic canvas (see useDynamicCanvas). */
export interface AtlasPage {
  readonly id: string
  readonly canvas: { width: number; height: number }
  readonly ctx: CanvasRenderingContext2D
  /** The most this page may grow to: it is the size a full page would have. */
  readonly maxWidth: number
  readonly maxHeight: number
  /** Change the canvas size in place, keeping what is painted (top-left, unscaled). */
  resize(width: number, height: number): void
  markDirty(x?: number, y?: number, width?: number, height?: number): void
}

/** Rows a page starts with when a size class claims it; it doubles when full, up to its limit. */
export const INITIAL_ROWS = 4

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
  /** Rows the canvas has now, and the most it may have. */
  rows: number
  maxRows: number
  /** Cells the canvas holds now. */
  capacity: number
  used: number
  keys: string[]
}

/**
 * Packs baked sprites into the textures of one SpriteLayer. SpriteLayer atlases
 * are uniform grids, so every page serves one cell size class, claimed lazily by
 * the first sprite that fits. A page costs nothing until it is claimed, and then
 * only the rows it needs: its width is fixed (so every cell keeps its frame
 * number) and its height doubles when it fills, up to the page's limit. A page
 * full at its limit is cleared and its sprites re-baked on demand (`epoch`
 * changes so callers drop any cell they cached).
 */
export class CellAtlas {
  /** Bumped when a page is cleared: cached CellRefs are no longer valid. */
  epoch = 0
  resets = 0
  bakes = 0
  rejected = 0
  grows = 0
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
    this.pages = io.map(() => ({
      cw: 0,
      ch: 0,
      cols: 0,
      rows: 0,
      maxRows: 0,
      capacity: 0,
      used: 0,
      keys: [],
    }))
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

  /** Cells in use, the most the claimed pages can hold, and the pixels their canvases take now. */
  usage(): { used: number; capacity: number; pages: number; pixels: number } {
    let used = 0
    let capacity = 0
    let pages = 0
    let pixels = 0
    for (const [i, p] of this.pages.entries()) {
      if (p.cw === 0) continue
      pages++
      used += p.used
      capacity += p.cols * p.maxRows
      pixels += this.io[i].canvas.width * this.io[i].canvas.height
    }
    return { used, capacity, pages, pixels }
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
      if (page.rows < page.maxRows) this.growPage(index)
      else {
        this.clearPage(index)
        page = this.pages[index]
      }
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
      const area = p.cw * p.ch + (p.used >= p.cols * p.maxRows ? 1e9 : 0)
      if (area < bestArea) {
        best = i
        bestArea = area
      }
    }
    // A fitting page that still has room, unless a tighter class could be claimed.
    const klass = this.classes.find(([cw, ch]) => cw >= needW && ch >= needH) ?? [needW, needH]
    if (best >= 0 && this.pages[best].used < this.pages[best].cols * this.pages[best].maxRows) {
      if (this.pages[best].cw * this.pages[best].ch <= klass[0] * klass[1] * 1.5) return best
    }
    const free = this.pages.findIndex((p) => p.cw === 0)
    if (free >= 0 && this.claim(free, klass[0], klass[1])) return free
    return best
  }

  private claim(index: number, cw: number, ch: number): boolean {
    const page = this.io[index]
    const cols = Math.floor(page.maxWidth / cw)
    const maxRows = Math.floor(page.maxHeight / ch)
    if (cols < 1 || maxRows < 1) return false
    const p = this.pages[index]
    p.cw = cw
    p.ch = ch
    p.cols = cols
    p.maxRows = maxRows
    p.rows = Math.min(maxRows, INITIAL_ROWS)
    p.capacity = cols * p.rows
    p.used = 0
    p.keys = []
    // The canvas has been a token size until now: it takes the shape of its grid.
    page.resize(cols * cw, p.rows * ch)
    page.markDirty()
    const at = this.atlases[index]
    at.frameWidth = cw
    at.frameHeight = ch
    at.frameColumns = cols
    return true
  }

  /** Double a full page's rows (to its limit). Cells keep their frames: the width does not change. */
  private growPage(index: number): void {
    const p = this.pages[index]
    p.rows = Math.min(p.maxRows, p.rows * 2)
    p.capacity = p.cols * p.rows
    this.io[index].resize(p.cols * p.cw, p.rows * p.ch)
    this.io[index].markDirty()
    this.grows++
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
