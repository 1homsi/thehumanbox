/**
 * The map's ground, sea, rock and snow, and its light direction. `docs/ART_DIRECTION.md` explains the rules;
 * this module holds the values. Every colour here is one of the master palette's (pixel-art/palette.ts), as
 * `[r, g, b]` for the painters that take triples.
 */
export type Rgb = readonly [number, number, number]

/** Warm dark ink for the outer outline of sprites: the master palette's darkest warm tone. Never pure black. */
export const INK: Rgb = [52, 28, 39]

/** Cast shadows: one flat translucent tone, falling to the bottom-right. */
export const SHADOW = { rgb: [9, 10, 20] as Rgb, alpha: 0.3 } as const

/**
 * The sea: `deep` water and the lighter `open` shelf round the land, two flat tints of the master palette's
 * blues. `shallows` is the tone of flooded ground and of things that live in the water. Past the edge of the
 * world the sea stays `deep`.
 */
export const OCEAN = {
  deep: [37, 58, 94],
  open: [60, 94, 139],
  shallows: [79, 143, 186],
  /** The thin light line where water meets the shore. */
  surf: [164, 221, 219],
} as const satisfies Record<string, Rgb>

/** Rivers and lakes: lighter and brighter than the sea, so a river reads across open country. */
export const FRESH_WATER = {
  deep: [79, 143, 186],
  mid: [79, 143, 186],
  edge: [115, 190, 211],
} as const satisfies Record<string, Rgb>

export const GRASS = {
  lush: [70, 130, 50],
  base: [117, 167, 67],
  light: [168, 202, 88],
  dry: [208, 218, 145],
} as const satisfies Record<string, Rgb>

export const FOREST = {
  dark: [25, 51, 45],
  mid: [37, 86, 46],
  light: [70, 130, 50],
} as const satisfies Record<string, Rgb>

export const SAND = {
  light: [231, 213, 179],
  wet: [215, 181, 148],
  desert: [232, 193, 112],
  dune: [192, 148, 115],
} as const satisfies Record<string, Rgb>

export const BIOME_TONES = {
  savanna: [232, 193, 112],
  tundra: [168, 181, 178],
  wetland: [87, 114, 119],
  badlands: [173, 119, 87],
  volcanic: [57, 74, 80],
} as const satisfies Record<string, Rgb>

/** Stone, from the face turned to the light down to the deepest shade. */
export const ROCK = {
  lit: [168, 181, 178],
  mid: [129, 151, 150],
  shade: [87, 114, 119],
  deep: [57, 74, 80],
} as const satisfies Record<string, Rgb>

export const SNOW = {
  lit: [235, 237, 233],
  shade: [199, 207, 204],
} as const satisfies Record<string, Rgb>

/** `#rrggbb` for a palette colour, for the places that take a CSS colour. */
export function hex([r, g, b]: Rgb): string {
  return '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')
}
