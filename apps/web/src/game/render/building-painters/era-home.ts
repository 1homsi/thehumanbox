import type { P } from './kit'
import { paintCottage, paintDwelling, paintEarlyHome, paintManor, paintTownhouse } from './dwellings'
import { paintModern } from './modern'
import {
  paintBungalow,
  paintCapsuleTower,
  paintClassicalHome,
  paintCubeHouse,
  paintDomeHabitat,
  paintEcoTower,
  paintFutureHome,
  paintGlassTower,
  paintHoverHome,
  paintMansard,
  paintMudBrickHome,
  paintPorchHouse,
  paintRowhouse,
  paintSteppedGable,
  paintTenement,
  paintVilla,
} from './home-forms'

/** The least modern style each home kind can take. */
const HOME_KIND_TIER: Record<string, number> = {
  Hut: 0,
  Tent: 0,
  House: 1,
  Manor: 3,
  TownHouse: 4,
  Apartment: 6,
  Skyscraper: 7,
}

/** Homes in their tribe's style; a kind never drops below its own tier. */
export function paintEraHome(p: P) {
  const tier = Math.max(HOME_KIND_TIER[p.kind] ?? 0, p.tier)
  // Each era has several house forms; the building's stable variant picks
  // one, so a street of the same era still mixes shapes.
  const form = p.variant
  switch (tier) {
    case 0:
      return paintEarlyHome(p)
    case 1:
      return paintCottage(p)
    case 2:
      return [paintClassicalHome, paintMudBrickHome, paintVilla][form % 3](p)
    case 3:
      return p.kind === 'Manor' ? paintManor(p) : paintDwelling(p)
    case 4:
      return form % 3 === 0
        ? paintTownhouse(p, false)
        : form % 3 === 1
          ? paintSteppedGable(p)
          : paintMansard(p)
    case 5:
      return [paintRowhouse, paintPorchHouse, paintTenement][form % 3](p)
    case 6:
      return form % 3 === 0
        ? paintModern({ ...p, kind: 'Apartment' })
        : form % 3 === 1
          ? paintBungalow(p)
          : paintCubeHouse(p)
    case 7:
      return [paintGlassTower, paintEcoTower, paintCapsuleTower][form % 3](p)
    default:
      return [paintFutureHome, paintDomeHabitat, paintFutureHome, paintHoverHome][form % 4](p)
  }
}
