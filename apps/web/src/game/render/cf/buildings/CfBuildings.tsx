import { useLayoutEffect, useMemo } from 'react'
import { useSpriteLayer } from 'cubeforge'
import { useCellAtlas } from '../atlas/useCellAtlas'
import type { CfRegistry } from '../registry'
import { registerBuildingLayer } from '../picking'
import { BUILDING_CLASSES, BuildingsDriver } from './buildings-driver'
import { GLOW_CLASSES, PROP_CLASSES, SpecialTilesDriver } from './special-tiles-driver'

/** z-order agreed with the other layers: buildings and props. */
export const BUILDINGS_Z = 20
/** Huts, fires and their light sit under the buildings, as they did in the canvas. */
export const PROPS_Z = 19
export const GLOW_Z = 18

const BUILDING_PAGES = [1024, 1024, 1024, 1024, 1024, 1024, 1024, 512]
const PROP_PAGES = [512, 512, 1024]
const GLOW_PAGES = [128, 128]

/**
 * Buildings, huts, fires and campfires as SpriteLayers; no React node per sprite.
 * The painters are the canvas ones: each distinct look is drawn once into an atlas.
 */
export function CfBuildings({ registry }: { registry: CfRegistry }) {
  const b = useCellAtlas(BUILDING_PAGES, BUILDING_CLASSES)
  const buildings = useSpriteLayer({
    atlases: b.atlases,
    sortByKey: true,
    zIndex: BUILDINGS_Z,
    sampling: 'nearest',
  })
  const p = useCellAtlas(PROP_PAGES, PROP_CLASSES)
  const props = useSpriteLayer({ atlases: p.atlases, sortByKey: true, zIndex: PROPS_Z, sampling: 'nearest' })
  const hits = useSpriteLayer({
    visible: false,
    sortByKey: true,
    anchorX: 0,
    anchorY: 0,
    zIndex: BUILDINGS_Z,
  })
  const g = useCellAtlas(GLOW_PAGES, GLOW_CLASSES)
  const glow = useSpriteLayer({ atlases: g.atlases, sortByKey: true, zIndex: GLOW_Z, sampling: 'linear' })

  const buildingsDriver = useMemo(
    () => new BuildingsDriver(buildings, b.atlas, hits),
    [buildings, b.atlas, hits],
  )
  const specialDriver = useMemo(
    () => new SpecialTilesDriver(props, p.atlas, glow, g.atlas),
    [props, p.atlas, glow, g.atlas],
  )
  useLayoutEffect(() => registry.add('buildings', buildingsDriver), [registry, buildingsDriver])
  useLayoutEffect(() => registerBuildingLayer((x, y) => buildingsDriver.pick(x, y)), [buildingsDriver])
  useLayoutEffect(() => registry.add('special', specialDriver), [registry, specialDriver])
  return null
}
