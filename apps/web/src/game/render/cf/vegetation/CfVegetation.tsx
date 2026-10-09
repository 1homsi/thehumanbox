import { useLayoutEffect, useMemo } from 'react'
import { useSpriteLayer } from 'xipjs'
import { useCellAtlas } from '../atlas/useCellAtlas'
import type { CfRegistry } from '../registry'
import { DECOR_CLASSES, DecorDriver } from './decor-driver'
import { MOUNTAIN_CLASSES, MountainsDriver } from './mountains-driver'
import { TREE_CLASSES, TreesDriver } from './trees-driver'
import { VegetationDriver } from './vegetation-driver'

/**
 * Ground vegetation sits between the terrain (0) and the ground overlays (10): in the
 * canvas painter it was baked into the terrain, under every overlay.
 */
export const DECOR_Z = 2
export const MOUNTAINS_Z = 3
export const TREES_Z = 4
export const SWAY_Z = 4.5
/** Cast shadows: above the mountains, under the trees. */
export const CAST_Z = 3.5
/** Seasonal specks on the crowns: above the trees, under the wind's canopy copies. */
export const DRESS_Z = 4.2

const DECOR_PAGES = [1024, 1024]
const MOUNTAIN_PAGES = [1024, 1024]
const TREE_PAGES = [512, 512, 512]

/** Trees, decor and mountains as SpriteLayers, rebuilt on terrain change. */
export function CfVegetation({ registry }: { registry: CfRegistry }) {
  const d = useCellAtlas(DECOR_PAGES, DECOR_CLASSES)
  const decor = useSpriteLayer({ atlases: d.atlases, zIndex: DECOR_Z, sampling: 'nearest' })
  const m = useCellAtlas(MOUNTAIN_PAGES, MOUNTAIN_CLASSES)
  const mountains = useSpriteLayer({ atlases: m.atlases, zIndex: MOUNTAINS_Z, sampling: 'nearest' })
  const t = useCellAtlas(TREE_PAGES, TREE_CLASSES)
  const trees = useSpriteLayer({ atlases: t.atlases, sortByKey: true, zIndex: TREES_Z, sampling: 'nearest' })
  // The wind overlay draws the same canopy cells, so it shares the trees' atlases.
  const sway = useSpriteLayer({ atlases: t.atlases, sortByKey: true, zIndex: SWAY_Z, sampling: 'nearest' })
  const cast = useSpriteLayer({ atlases: t.atlases, zIndex: CAST_Z, sampling: 'nearest' })
  const dress = useSpriteLayer({ atlases: t.atlases, zIndex: DRESS_Z, sampling: 'nearest' })

  const driver = useMemo(
    () =>
      new VegetationDriver(
        new DecorDriver(decor, d.atlas),
        new MountainsDriver(mountains, m.atlas),
        new TreesDriver(trees, sway, t.atlas, cast, dress),
      ),
    [decor, d.atlas, mountains, m.atlas, trees, sway, cast, dress, t.atlas],
  )
  useLayoutEffect(() => registry.add('vegetation', driver), [registry, driver])
  return null
}
