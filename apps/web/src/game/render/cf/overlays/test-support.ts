import type { SpriteLayer } from 'cubeforge'
import type { Tint } from './atmosphere'
import type { RenderHost } from './host'

/** A render host that records what the renderer asked of the engine, with no GPU behind it. */
export interface StubHost extends RenderHost {
  layers: SpriteLayer[]
  tint: Tint | null
  registered: Map<string, HTMLCanvasElement>
  dirtyRects: { id: string; x: number; y: number; w: number; h: number }[]
  dirtyCount: number
}

export function stubHost(): StubHost {
  const host: StubHost = {
    layers: [],
    tint: null,
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
    setScreenTint(tint) {
      host.tint = tint
    },
    markDirty() {
      host.dirtyCount++
    },
  }
  return host
}

/** A 2D context that accepts every call; `fillRect` and filled `rect` paths are reported with the fill style at the time. */
export function recordingContext(
  onRect: (x: number, y: number, w: number, h: number, style: string) => void,
) {
  const pathRects: [number, number, number, number][] = []
  const state: Record<string | symbol, unknown> = { fillStyle: '#000' }
  const handler: ProxyHandler<object> = {
    get(_t, prop) {
      if (prop === 'fillRect')
        return (x: number, y: number, w: number, h: number) => onRect(x, y, w, h, String(state.fillStyle))
      if (prop === 'beginPath') return () => (pathRects.length = 0)
      if (prop === 'rect') return (x: number, y: number, w: number, h: number) => pathRects.push([x, y, w, h])
      if (prop === 'fill')
        return () => {
          for (const [x, y, w, h] of pathRects) onRect(x, y, w, h, String(state.fillStyle))
        }
      if (prop in state) return state[prop]
      return () => undefined
    },
    set(_t, prop, value) {
      state[prop] = value
      return true
    },
  }
  return new Proxy({}, handler) as unknown as CanvasRenderingContext2D
}
