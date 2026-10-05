import type { SpriteLayer } from 'cubeforge'
import type { RenderHost } from './host'

/** A render host that records what the renderer asked of the engine, with no GPU behind it. */
export interface StubHost extends RenderHost {
  layers: SpriteLayer[]
  registered: Map<string, HTMLCanvasElement>
  dirtyRects: { id: string; x: number; y: number; w: number; h: number }[]
  dirtyCount: number
}

export function stubHost(): StubHost {
  const host: StubHost = {
    layers: [],
    registered: new Map(),
    dirtyRects: [],
    dirtyCount: 0,
    register(id, canvas) {
      host.registered.set(id, canvas)
    },
    unregister(id) {
      host.registered.delete(id)
    },
    dirty(id, x, y, w, h) {
      host.dirtyRects.push({ id, x, y, w, h })
    },
    addLayer(layer) {
      host.layers.push(layer)
    },
    removeLayer(layer) {
      host.layers = host.layers.filter((l) => l !== layer)
    },
    markDirty() {
      host.dirtyCount++
    },
  }
  return host
}
