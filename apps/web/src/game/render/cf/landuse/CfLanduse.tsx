import { useLayoutEffect, useMemo } from 'react'
import { useSpriteLayer } from 'xipjs'
import { useCellAtlas } from '../atlas/useCellAtlas'
import type { CfRegistry } from '../registry'
import { LANDUSE_CLASSES, LanduseDriver } from './landuse-driver'

/** Agreed z-order: land use. */
export const LANDUSE_Z = 15
const PAGES = [512]

/** Farms and plantings as a SpriteLayer. */
export function CfLanduse({ registry }: { registry: CfRegistry }) {
  const a = useCellAtlas(PAGES, LANDUSE_CLASSES)
  const layer = useSpriteLayer({ atlases: a.atlases, zIndex: LANDUSE_Z, sampling: 'nearest' })
  const driver = useMemo(() => new LanduseDriver(layer, a.atlas), [layer, a.atlas])
  useLayoutEffect(() => registry.add('landuse', driver), [registry, driver])
  return null
}
