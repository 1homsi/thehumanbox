/**
 * The map's shared palette and light direction. `docs/ART_DIRECTION.md` explains the rules; this module holds
 * the values. Colours are `[r, g, b]` so painters can mix and shade them without parsing strings.
 */
export type Rgb = readonly [number, number, number]

/** Warm dark ink for the outer outline of sprites. Never pure black. */
export const INK: Rgb = [43, 33, 23]

/** Cast shadows: one flat translucent tone, falling to the bottom-right. */
export const SHADOW = { rgb: [28, 20, 12] as Rgb, alpha: 0.32 } as const

/** Screen-space direction the light comes from (x right, y down): the top-left. */
export const LIGHT_FROM = { x: -1, y: -1 } as const

/** How far a cast shadow falls per pixel of height, toward the bottom-right. */
export const SHADOW_STEP = { x: 1, y: 1 } as const

/** Sea depth bands, deepest first. Past the edge of the world the sea stays `abyss`. */
export const OCEAN = {
  abyss: [22, 48, 61],
  deep: [28, 61, 76],
  open: [35, 80, 93],
  shelf: [46, 101, 105],
  shallows: [74, 128, 121],
  /** The thin light line where water meets the shore. */
  surf: [185, 205, 176],
} as const satisfies Record<string, Rgb>

/** Rivers and lakes: calmer and greener than the open sea. */
export const FRESH_WATER = {
  deep: [52, 98, 104],
  mid: [61, 111, 116],
  edge: [96, 141, 132],
} as const satisfies Record<string, Rgb>

export const GRASS = {
  lush: [107, 127, 63],
  base: [125, 139, 74],
  light: [143, 156, 85],
  dry: [156, 148, 85],
} as const satisfies Record<string, Rgb>

export const FOREST = {
  dark: [61, 82, 48],
  mid: [79, 104, 56],
  light: [106, 131, 68],
} as const satisfies Record<string, Rgb>

export const SAND = {
  light: [205, 181, 136],
  wet: [169, 148, 112],
  desert: [199, 164, 104],
  dune: [168, 133, 78],
} as const satisfies Record<string, Rgb>

export const BIOME_TONES = {
  savanna: [179, 156, 92],
  tundra: [155, 164, 140],
  wetland: [95, 110, 72],
  badlands: [168, 97, 62],
  volcanic: [74, 63, 58],
} as const satisfies Record<string, Rgb>

/** Stone, from the face turned to the light down to the deepest shade. */
export const ROCK = {
  lit: [176, 164, 139],
  mid: [133, 123, 105],
  shade: [90, 81, 71],
  deep: [60, 53, 46],
} as const satisfies Record<string, Rgb>

export const SNOW = {
  lit: [236, 238, 228],
  shade: [183, 193, 192],
} as const satisfies Record<string, Rgb>

/** `#rrggbb` for a palette colour, for the places that take a CSS colour. */
export function hex([r, g, b]: Rgb): string {
  return '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')
}
