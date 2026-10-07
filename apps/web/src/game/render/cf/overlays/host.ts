import type { SpriteLayer, TextLayer } from 'cubeforge'
import { wakeEngine } from '../frame-clock'
import { engineAtlasHost, type AtlasHost } from './atlas-host'

/** Everything the overlay renderer needs from the engine, so it can run against a stub in tests. */
export interface RenderHost extends AtlasHost {
  addLayer(layer: SpriteLayer): void
  removeLayer(layer: SpriteLayer): void
  addTextLayer(layer: TextLayer): void
  removeTextLayer(layer: TextLayer): void
  markDirty(): void
}

interface LayerRenderer {
  addSpriteLayer?: (layer: SpriteLayer) => void
  removeSpriteLayer?: (layer: SpriteLayer) => void
  addTextLayer?: (layer: TextLayer) => void
  removeTextLayer?: (layer: TextLayer) => void
}

export interface EngineLike {
  activeRenderSystem?: unknown
  loop: { markDirty(): void }
}

/** The cubeforge engine behind the `RenderHost` interface. */
export function engineRenderHost(engine: EngineLike): RenderHost {
  const rs = () => engine.activeRenderSystem as LayerRenderer | undefined
  return {
    ...engineAtlasHost(engine),
    addLayer(layer) {
      rs()?.addSpriteLayer?.(layer)
      engine.loop.markDirty()
    },
    removeLayer(layer) {
      rs()?.removeSpriteLayer?.(layer)
    },
    addTextLayer(layer) {
      rs()?.addTextLayer?.(layer)
      engine.loop.markDirty()
    },
    removeTextLayer(layer) {
      rs()?.removeTextLayer?.(layer)
    },
    markDirty() {
      wakeEngine(engine, 30)
    },
  }
}
