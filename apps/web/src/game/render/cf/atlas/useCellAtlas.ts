import { useMemo } from 'react'
import { useDynamicCanvas } from 'cubeforge'
import type { LayerAtlas } from 'cubeforge'
import { CellAtlas, type AtlasPage } from './cell-atlas'

/** Change a canvas size in place and keep what was painted on it. The engine re-creates the texture at the new size. */
export function resizeCanvasKeeping(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
) {
  if (canvas.width === w && canvas.height === h) return
  let backup: HTMLCanvasElement | null = null
  if (canvas.width > 4 && canvas.height > 4) {
    backup = document.createElement('canvas')
    backup.width = canvas.width
    backup.height = canvas.height
    backup.getContext('2d')?.drawImage(canvas, 0, 0)
  }
  // Setting the size clears the canvas and resets the context.
  canvas.width = w
  canvas.height = h
  if (backup) ctx.drawImage(backup, 0, 0)
}

/** The size an unclaimed page has: it costs next to nothing until a cell size claims it. */
const IDLE_SIZE = 4

/**
 * Up to eight dynamic canvases (the most the engine draws per SpriteLayer) as the atlases of one SpriteLayer.
 * `useDynamicCanvas` is a hook with a fixed count per call, so the number of pages is fixed at mount, but a page
 * is a 4x4 canvas until a cell size claims it, and then it grows by rows only as far as it fills: `sizes[i]` is the
 * most page i may become, not what it costs. Sizes beyond `sizes.length` stay 4x4 and are never claimed.
 */
export function useCellAtlas(
  sizes: readonly number[],
  classes: ReadonlyArray<readonly [number, number]>,
): { atlas: CellAtlas; atlases: LayerAtlas[] } {
  const p0 = useDynamicCanvas(IDLE_SIZE, IDLE_SIZE)
  const p1 = useDynamicCanvas(IDLE_SIZE, IDLE_SIZE)
  const p2 = useDynamicCanvas(IDLE_SIZE, IDLE_SIZE)
  const p3 = useDynamicCanvas(IDLE_SIZE, IDLE_SIZE)
  const p4 = useDynamicCanvas(IDLE_SIZE, IDLE_SIZE)
  const p5 = useDynamicCanvas(IDLE_SIZE, IDLE_SIZE)
  const p6 = useDynamicCanvas(IDLE_SIZE, IDLE_SIZE)
  const p7 = useDynamicCanvas(IDLE_SIZE, IDLE_SIZE)
  return useMemo(() => {
    const handles = [p0, p1, p2, p3, p4, p5, p6, p7]
    const pages: AtlasPage[] = handles.map((h, i) => {
      const limit = i < sizes.length ? sizes[i] : 0
      return {
        id: h.id,
        canvas: h.canvas,
        ctx: h.ctx,
        maxWidth: limit,
        maxHeight: limit,
        resize: (w, ht) => resizeCanvasKeeping(h.canvas, h.ctx, w, ht),
        markDirty: h.markDirty,
      }
    })
    const atlases: LayerAtlas[] = []
    return { atlas: new CellAtlas(pages, classes, atlases), atlases }
    // `sizes` is a module constant at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p0, p1, p2, p3, p4, p5, p6, p7, classes])
}
