import { useLayoutEffect, useMemo } from 'react'
import { useSpriteLayer } from 'cubeforge'
import { useCellAtlas } from '../atlas/useCellAtlas'
import type { CfRegistry } from '../registry'
import { FoamDriver, GROUND_CLASSES, PatchDriver, ShoreDriver, StructureDriver } from './ground-drivers'
import { AccentDriver } from './terrain-accents'
import { WaterPlantDriver } from './water-plants'

/**
 * Where the ground detail sits: the shore banks and reeds were part of the terrain (under the
 * day/night tint, which is at 5), the rest was drawn after it.
 */
export const SHORE_Z = 2.5
export const FOAM_Z = 5.2
export const PATCH_Z = 5.5
export const STRUCTURE_Z = 5.6
/** Dune marks and lava veins: over the tint (so the lava glows at night), under the buildings. */
export const ACCENT_Z = 5.25
/** Lily pads: on the open water, over the shore marks, under the foam and the ice's wash. */
export const WATER_PLANT_Z = 2.6

/** Shoreline, foam, food and mineral patches and the settlement marks, as SpriteLayers. */
export function CfGround({ registry }: { registry: CfRegistry }) {
  const shoreAtlas = useCellAtlas([512, 512], GROUND_CLASSES)
  const shore = useSpriteLayer({ atlases: shoreAtlas.atlases, zIndex: SHORE_Z, sampling: 'nearest' })
  const patchAtlas = useCellAtlas([256], GROUND_CLASSES)
  const patches = useSpriteLayer({ atlases: patchAtlas.atlases, zIndex: PATCH_Z, sampling: 'nearest' })
  // The foam is untextured rectangles; it borrows the patch atlas only to have one.
  const foam = useSpriteLayer({ atlases: patchAtlas.atlases, zIndex: FOAM_Z, sampling: 'nearest' })
  // Dune marks and lava veins are untextured rectangles too.
  const accents = useSpriteLayer({ atlases: patchAtlas.atlases, zIndex: ACCENT_Z, sampling: 'nearest' })
  // Lily pads are untextured rectangles too.
  const waterPlants = useSpriteLayer({
    atlases: patchAtlas.atlases,
    zIndex: WATER_PLANT_Z,
    sampling: 'nearest',
  })
  const structureAtlas = useCellAtlas([256], GROUND_CLASSES)
  const structure = useSpriteLayer({
    atlases: structureAtlas.atlases,
    zIndex: STRUCTURE_Z,
    sampling: 'nearest',
  })

  const drivers = useMemo(
    () => ({
      shore: new ShoreDriver(shore, shoreAtlas.atlas),
      patches: new PatchDriver(patches, patchAtlas.atlas),
      foam: new FoamDriver(foam),
      accents: new AccentDriver(accents),
      waterPlants: new WaterPlantDriver(waterPlants),
      structure: new StructureDriver(structure, structureAtlas.atlas),
    }),
    [
      shore,
      shoreAtlas.atlas,
      patches,
      patchAtlas.atlas,
      foam,
      accents,
      waterPlants,
      structure,
      structureAtlas.atlas,
    ],
  )
  useLayoutEffect(() => {
    const removers = [
      registry.add('shore', drivers.shore),
      registry.add('patches', drivers.patches),
      registry.add('foam', drivers.foam),
      registry.add('accents', drivers.accents),
      registry.add('waterPlants', drivers.waterPlants),
      registry.add('structure', drivers.structure),
    ]
    return () => removers.forEach((remove) => remove())
  }, [registry, drivers])
  return null
}
