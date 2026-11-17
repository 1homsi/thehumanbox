/**
 * The master palette of the map's drawn sprites: 46 colours in six hue ramps of six and one grey ramp of ten
 * (the Apollo palette by AdamCYounis). Shades shift in hue as they darken (greens toward blue, reds toward
 * plum), which is what makes a flat-coloured sprite read as painted rather than tinted. A sprite stores
 * indexes into this list, so it cannot hold a colour from outside it. Index 0 is "no pixel".
 */
export const PALETTE_HEX = [
  '172038',
  '253a5e',
  '3c5e8b',
  '4f8fba',
  '73bed3',
  'a4dddb',
  '19332d',
  '25562e',
  '468232',
  '75a743',
  'a8ca58',
  'd0da91',
  '4d2b32',
  '7a4841',
  'ad7757',
  'c09473',
  'd7b594',
  'e7d5b3',
  '341c27',
  '602c2c',
  '884b2b',
  'be772b',
  'de9e41',
  'e8c170',
  '241527',
  '411d31',
  '752438',
  'a53030',
  'cf573c',
  'da863e',
  '1e1d39',
  '402751',
  '7a367b',
  'a23e8c',
  'c65197',
  'df84a5',
  '090a14',
  '10141f',
  '151d28',
  '202e37',
  '394a50',
  '577277',
  '819796',
  'a8b5b2',
  'c7cfcc',
  'ebede9',
] as const

/** `[r, g, b]` for each palette index; entry 0 is unused (index 0 is transparent). */
export const PALETTE_RGB: readonly (readonly [number, number, number])[] = [
  [0, 0, 0],
  ...PALETTE_HEX.map(
    (h) => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)] as const,
  ),
]

/** `#rrggbb` for a palette index, for the canvas code that draws round the sprites (sites, ruins). */
export const hexOf = (index: number): string => `#${PALETTE_HEX[index - 1]}`

/** The index of the palette colour nearest a `#rrggbb` colour: how a colour from outside (a crop's, a tribe's) comes onto the palette. */
export function nearestIndex(colour: string): number {
  const h = colour.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  let best = 1
  let bestD = Infinity
  for (let i = 1; i < PALETTE_RGB.length; i++) {
    const p = PALETTE_RGB[i]
    const d = (p[0] - r) ** 2 + (p[1] - g) ** 2 + (p[2] - b) ** 2
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}

/** Palette indexes by name: each ramp runs from 0 (darkest) upward. */
export const C = {
  blue0: 1,
  blue1: 2,
  blue2: 3,
  blue3: 4,
  blue4: 5,
  blue5: 6,
  green0: 7,
  green1: 8,
  green2: 9,
  green3: 10,
  green4: 11,
  green5: 12,
  tan0: 13,
  tan1: 14,
  tan2: 15,
  tan3: 16,
  tan4: 17,
  tan5: 18,
  gold0: 19,
  gold1: 20,
  gold2: 21,
  gold3: 22,
  gold4: 23,
  gold5: 24,
  red0: 25,
  red1: 26,
  red2: 27,
  red3: 28,
  red4: 29,
  red5: 30,
  plum0: 31,
  plum1: 32,
  plum2: 33,
  plum3: 34,
  plum4: 35,
  plum5: 36,
  grey0: 37,
  grey1: 38,
  grey2: 39,
  grey3: 40,
  grey4: 41,
  grey5: 42,
  grey6: 43,
  grey7: 44,
  grey8: 45,
  grey9: 46,
} as const

/** The outline of every drawn sprite: the darkest warm tone, never pure black. */
export const INK = C.gold0

/** A material in four tones: highlight, lit, shade, deep shade. */
export type Ramp = readonly [number, number, number, number]

export const ROOF = {
  tile: [C.red5, C.red4, C.red3, C.red2],
  straw: [C.gold5, C.gold4, C.gold3, C.gold2],
  slate: [C.blue3, C.blue2, C.blue1, C.blue0],
  moss: [C.green4, C.green3, C.green2, C.green1],
  wood: [C.tan2, C.tan1, C.tan0, C.gold0],
  stone: [C.grey7, C.grey6, C.grey5, C.grey4],
  hide: [C.tan4, C.tan3, C.tan2, C.tan1],
  plum: [C.plum3, C.plum2, C.plum1, C.plum0],
  copper: [C.blue5, C.blue4, C.grey5, C.grey4],
  dark: [C.grey5, C.grey4, C.grey3, C.grey2],
  snow: [C.grey9, C.grey9, C.grey8, C.grey7],
} as const satisfies Record<string, Ramp>

export const WALL = {
  plaster: [C.tan5, C.tan4, C.tan4, C.tan3],
  daub: [C.tan5, C.tan4, C.tan3, C.tan2],
  wood: [C.tan3, C.tan2, C.tan1, C.tan0],
  stone: [C.grey8, C.grey7, C.grey6, C.grey5],
  darkStone: [C.grey7, C.grey6, C.grey5, C.grey4],
  brick: [C.red4, C.red3, C.red3, C.red2],
  darkBrick: [C.red3, C.red2, C.red2, C.red1],
  sand: [C.gold5, C.tan4, C.tan3, C.tan2],
  white: [C.grey9, C.grey9, C.grey8, C.grey7],
  concrete: [C.grey8, C.grey7, C.grey6, C.grey5],
  steel: [C.grey7, C.grey6, C.grey5, C.grey4],
  glass: [C.blue5, C.blue4, C.blue3, C.blue2],
  night: [C.grey5, C.grey4, C.grey3, C.grey2],
  ice: [C.grey9, C.blue5, C.blue4, C.blue3],
  turf: [C.green4, C.green3, C.green2, C.green1],
} as const satisfies Record<string, Ramp>

export type RoofName = keyof typeof ROOF
export type WallName = keyof typeof WALL
