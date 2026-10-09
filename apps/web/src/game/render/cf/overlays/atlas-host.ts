/** What the atlases need from the engine: a way to publish a canvas as a texture and to say which part changed. */
export interface AtlasHost {
  register(id: string, canvas: HTMLCanvasElement): void
  unregister(id: string): void
  /** Re-upload this region (canvas pixels) before the next frame. */
  dirty(id: string, x: number, y: number, w: number, h: number): void
}

interface DynamicCanvasRenderer {
  registerDynamicCanvas?: (id: string, canvas: HTMLCanvasElement) => void
  unregisterDynamicCanvas?: (id: string) => void
  markDynamicCanvasDirty?: (id: string, x?: number, y?: number, w?: number, h?: number) => void
}

/** Adapter over xipjs's active render system (what `useDynamicCanvas` does, minus React). */
export function engineAtlasHost(engine: {
  activeRenderSystem?: unknown
  loop: { markDirty(): void }
}): AtlasHost {
  const rs = () => engine.activeRenderSystem as DynamicCanvasRenderer | undefined
  return {
    register(id, canvas) {
      rs()?.registerDynamicCanvas?.(id, canvas)
      engine.loop.markDirty()
    },
    unregister(id) {
      rs()?.unregisterDynamicCanvas?.(id)
    },
    dirty(id, x, y, w, h) {
      rs()?.markDynamicCanvasDirty?.(id, x, y, w, h)
      engine.loop.markDirty()
    },
  }
}

let nextId = 1
export function atlasId(kind: string): string {
  return `__thb_cf_${kind}_${nextId++}`
}

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}
