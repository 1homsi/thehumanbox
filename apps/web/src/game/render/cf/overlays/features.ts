import { cfFlag } from '../flags'

/** The opt-in ground-sprite tint mode is asked for by name only, so `all` keeps the default screen tint. */
function tintOnGround(): boolean {
  try {
    return (new URLSearchParams(window.location.search).get('cf') ?? '')
      .toLowerCase()
      .split(',')
      .includes('tint-ground')
  } catch {
    return false
  }
}

/** Which migrated pieces the overlay renderer owns (each mirrors a canvas layer file or helper). */
export interface CfFeatures {
  /** `layers/atmosphere.ts`: season/day/night/weather tint, rain and snow, stars on water. */
  atmosphere: boolean
  /** `layers/overlays.ts`: heat maps, territory, clouds, history and partner lines, worn paths. */
  overlays: boolean
  /** `layers/effects.ts`: beacons, smog, traffic, battles, festivals, wards. */
  effects: boolean
  /** `layers/hud.ts`: settlement names, world moments, prayers, grid. */
  hud: boolean
  /** Water shimmer and wavelets (`water-fx`, from the terrain painter). */
  water: boolean
  /** Fire and campfire glow at night (`special-tiles`, from the terrain painter). */
  glow: boolean
  /** Trade roads (`roads`, from the land-use painter). */
  roads: boolean
  /** Where the whole-atmosphere tint goes: one `useScreenTint` call, or full-world sprites under the people. */
  tint: 'screen' | 'ground'
}

export const NO_FEATURES: CfFeatures = {
  atmosphere: false,
  overlays: false,
  effects: false,
  hud: false,
  water: false,
  glow: false,
  roads: false,
  tint: 'screen',
}

/** Which overlay pieces the URL / local storage switched on (`?cf=atmosphere,overlays,effects,hud,...`). */
export function readCfFeatures(): CfFeatures {
  return {
    atmosphere: cfFlag('atmosphere'),
    overlays: cfFlag('overlays'),
    effects: cfFlag('effects'),
    hud: cfFlag('hud'),
    water: cfFlag('water'),
    glow: cfFlag('glow'),
    roads: cfFlag('roads'),
    tint: tintOnGround() ? 'ground' : 'screen',
  }
}

export function anyCfOverlay(f: CfFeatures): boolean {
  return f.atmosphere || f.overlays || f.effects || f.hud || f.water || f.glow || f.roads
}
