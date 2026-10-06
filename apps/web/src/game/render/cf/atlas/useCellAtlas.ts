import { useEffect, useMemo } from 'react'
import { useGame } from 'cubeforge'
import type { DynamicCanvasOptions, LayerAtlas, ManagedDynamicCanvas } from 'cubeforge'
import { CellAtlas, type AtlasPage, type AtlasPageSlot } from './cell-atlas'

interface CanvasHost {
  createDynamicCanvas(options: DynamicCanvasOptions): ManagedDynamicCanvas
}

/** One engine dynamic canvas as an atlas page. */
function openPage(engine: { activeRenderSystem?: unknown }, width: number, height: number): AtlasPage {
  const host = engine.activeRenderSystem as CanvasHost | undefined
  if (!host?.createDynamicCanvas) throw new Error('the engine has no dynamic canvases')
  const canvas = host.createDynamicCanvas({ width, height })
  return {
    id: canvas.id,
    canvas: canvas.canvas,
    ctx: canvas.ctx,
    resize: (w, h) => canvas.resize(w, h),
    markDirty: (x, y, w, h) => canvas.markDirty(x, y, w, h),
    dispose: () => canvas.dispose(),
  }
}

/**
 * The atlases of one SpriteLayer: up to eight pages (the most the engine draws per layer), each a dynamic
 * canvas that comes into being when a cell size claims it, with the rows it needs, and grows as it fills.
 * `sizes[i]` is the most page i may become, not what it costs: an atlas nobody bakes into holds no memory.
 */
export function useCellAtlas(
  sizes: readonly number[],
  classes: ReadonlyArray<readonly [number, number]>,
): { atlas: CellAtlas; atlases: LayerAtlas[] } {
  const engine = useGame()
  const made = useMemo(() => {
    const atlases: LayerAtlas[] = []
    const slots: AtlasPageSlot[] = sizes.map((limit) => ({
      maxWidth: limit,
      maxHeight: limit,
      open: (width, height) => openPage(engine, width, height),
    }))
    return { atlas: new CellAtlas(slots, classes, atlases), atlases }
    // `sizes` is a module constant at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, classes])
  useEffect(() => () => made.atlas.dispose(), [made])
  return made
}
