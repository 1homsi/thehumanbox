import { useLayoutEffect, useMemo } from 'react'
import { useSpriteLayer } from 'cubeforge'
import { useCellAtlas } from '../atlas/useCellAtlas'
import type { CfRegistry } from '../registry'
import { ROAD_CLASSES, RoadDriver } from './road-driver'

/**
 * Agreed z-order: roads lie on the ground, over the ground decor (z 2), under the mountains, shadows,
 * the trees and the buildings.
 */
export const ROADS_Z = 2.2
const PAGES = [512]

/** Roads the people have built, as a SpriteLayer over the terrain. */
export function CfRoads({ registry }: { registry: CfRegistry }) {
  const a = useCellAtlas(PAGES, ROAD_CLASSES)
  const layer = useSpriteLayer({ atlases: a.atlases, zIndex: ROADS_Z, sampling: 'nearest' })
  const driver = useMemo(() => new RoadDriver(layer, a.atlas), [layer, a.atlas])
  useLayoutEffect(() => registry.add('roads', driver), [registry, driver])
  return null
}
