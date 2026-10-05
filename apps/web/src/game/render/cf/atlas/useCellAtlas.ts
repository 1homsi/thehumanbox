import { useMemo } from 'react'
import { useDynamicCanvas } from 'cubeforge'
import type { LayerAtlas } from 'cubeforge'
import { CellAtlas, type AtlasPage } from './cell-atlas'

/** The engine draws at most this many textures per SpriteLayer. */
export const MAX_PAGES = 8

/**
 * Up to eight dynamic canvases as the atlases of one SpriteLayer. `useDynamicCanvas`
 * is a hook with a fixed size per call, so the page count and sizes are fixed at
 * mount: sizes beyond `sizes.length` stay 4x4 and are never claimed.
 */
export function useCellAtlas(
  sizes: readonly number[],
  classes: ReadonlyArray<readonly [number, number]>,
): { atlas: CellAtlas; atlases: LayerAtlas[] } {
  const s = (i: number) => (i < sizes.length ? sizes[i] : 4)
  const p0 = useDynamicCanvas(s(0), s(0))
  const p1 = useDynamicCanvas(s(1), s(1))
  const p2 = useDynamicCanvas(s(2), s(2))
  const p3 = useDynamicCanvas(s(3), s(3))
  const p4 = useDynamicCanvas(s(4), s(4))
  const p5 = useDynamicCanvas(s(5), s(5))
  const p6 = useDynamicCanvas(s(6), s(6))
  const p7 = useDynamicCanvas(s(7), s(7))
  return useMemo(() => {
    const pages: AtlasPage[] = [p0, p1, p2, p3, p4, p5, p6, p7]
    const atlases: LayerAtlas[] = []
    return { atlas: new CellAtlas(pages, classes, atlases), atlases }
  }, [p0, p1, p2, p3, p4, p5, p6, p7, classes])
}
