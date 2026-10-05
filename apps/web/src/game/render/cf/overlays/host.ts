import type { SpriteLayer } from 'cubeforge'
import { engineAtlasHost, type AtlasHost } from './atlas-host'
import type { Tint } from './atmosphere'

/** Everything the overlay renderer needs from the engine, so it can run against a stub in tests. */
export interface RenderHost extends AtlasHost {
  addLayer(layer: SpriteLayer): void
  removeLayer(layer: SpriteLayer): void
  /** One full-view tint drawn after the sprites (source-over), or none. */
  setScreenTint(tint: Tint | null): void
  markDirty(): void
}

interface LayerRenderer {
  addSpriteLayer?: (layer: SpriteLayer) => void
  removeSpriteLayer?: (layer: SpriteLayer) => void
  setScreenTint?: (
    r: number,
    g: number,
    b: number,
    a: number,
    mode?: 'multiply' | 'normal' | 'additive',
  ) => void
  clearScreenTint?: () => void
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
    setScreenTint(tint) {
      const r = rs()
      if (!tint) r?.clearScreenTint?.()
      else r?.setScreenTint?.(tint.r / 255, tint.g / 255, tint.b / 255, tint.a, 'normal')
    },
    markDirty() {
      engine.loop.markDirty()
    },
  }
}
