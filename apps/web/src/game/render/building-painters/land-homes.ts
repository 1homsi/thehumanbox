import { BIOME_ID } from '../../model/terrain-ids'
import type { P } from './kit'

/**
 * Early homes follow the land they stand on, so two tribes' villages look different from across the map:
 *
 * - grassland and savanna: round houses, a daub drum under a tall cone of thatch;
 * - desert and badlands: a flat-roofed mud-brick house with a white dome, behind a low courtyard wall;
 * - taiga, and every other house on the tundra: a long, low turf hall, grass growing on its roof;
 * - tundra: snow igloos;
 * - wetland: thatched houses on stilts over the water;
 * - forest and jungle: long thatched longhouses.
 *
 * Volcanic ground keeps the default hut.
 */
export type HomeLand = 'snow' | 'adobe' | 'stilt' | 'longhouse' | 'round' | 'turf' | ''

/** The local house style for a biome id (see BIOME_ID); '' keeps the default hut. */
export function homeLandOfBiome(biome: number): HomeLand {
  switch (biome) {
    case BIOME_ID.TUNDRA:
      return 'snow'
    case BIOME_ID.TAIGA:
      return 'turf'
    case BIOME_ID.DESERT:
    case BIOME_ID.BADLANDS:
      return 'adobe'
    case BIOME_ID.WETLAND:
      return 'stilt'
    case BIOME_ID.FOREST:
    case BIOME_ID.JUNGLE:
      return 'longhouse'
    case BIOME_ID.GRASSLAND:
    case BIOME_ID.SAVANNA:
      return 'round'
    default:
      return ''
  }
}

/**
 * A home as rows of characters, one colour per character ('.' is see-through).
 * `drop` moves the map below the tile's bottom edge: stilts stand in the water.
 */
interface HomeMap {
  rows: readonly string[]
  colors: Readonly<Record<string, string>>
  drop: number
}

const IGLOO: HomeMap = {
  rows: ['..oooo..', '.owwwwo.', 'owwswwwo', 'owswwwso', 'owwwwwwo', 'owddwwwo', 'oooooooo'],
  colors: { o: '#2a3440', w: '#eef4f7', s: '#b9cad6', d: '#2c3a48' },
  drop: 0,
}

const STILT: HomeMap = {
  rows: [
    '...oo...',
    '..oHHo..',
    '.oHHhho.',
    'oHHHhhho',
    'ohhhhhho',
    'oTTgTTto',
    'oTTddTto',
    'oTTddTto',
    'oooooooo',
    '.l....l.',
    '.l....l.',
    'wlwwwwlw',
  ],
  colors: {
    o: '#2a2016',
    H: '#c9ac5a',
    h: '#8f7434',
    T: '#8a6a46',
    t: '#6a4e32',
    g: '#f2d88a',
    d: '#2a1c10',
    l: '#4a3520',
    w: '#4d7a7e',
  },
  drop: 3,
}

const LONGHOUSE: HomeMap = {
  rows: [
    '..HHHHHH..',
    '.HHhhhhHH.',
    'oHHHHHHHHo',
    'oooooooooo',
    'oTTTTTTTTo',
    'oTdTTTdTTo',
    'oTdTTTdTTo',
    'oooooooooo',
  ],
  colors: { o: '#3a2c18', H: '#b89a4a', h: '#7d6430', T: '#8a6a46', d: '#2a1c10' },
  drop: 0,
}

/** Paints a map centred on the home's footprint. */
function paintMap(p: P, map: HomeMap) {
  const cols = map.rows[0].length
  const x = p.x0 + Math.floor((p.w - cols) / 2)
  const bottom = p.y1 - 1 + map.drop
  map.rows.forEach((row, r) => {
    const y = bottom - (map.rows.length - 1 - r)
    for (let c = 0; c < row.length; c++) {
      const color = map.colors[row[c]]
      if (color) dot(p, x + c, y, color)
    }
  })
}

/** One whole pixel. Land homes are drawn pixel by pixel, so every edge is a clean staircase. */
function dot(p: P, x: number, y: number, color: string) {
  p.ctx.fillStyle = color
  p.ctx.fillRect(Math.round(x), Math.round(y), 1, 1)
}

/** A horizontal run of pixels from x0 to x1 inclusive. */
function run(p: P, x0: number, x1: number, y: number, color: string) {
  for (let x = Math.round(x0); x <= Math.round(x1); x++) dot(p, x, y, color)
}

// Darker than the dry grass the round houses stand on, so a roof never melts into the savanna.
const THATCH = { lit: '#b48f48', mid: '#8a6c34', shade: '#5e4a24' }
const DAUB = { lit: '#cdb487', mid: '#a88d62', shade: '#7d6646' }
const MUD = { lit: '#e2c18e', mid: '#c49a66', shade: '#94704a' }
const LIME = { lit: '#f1e8d2', mid: '#d8ccb0', shade: '#a99c80' }
const TURF = { lit: '#8e9e54', mid: '#6b7f3f', shade: '#4d5e30' }
const TIMBER = { lit: '#8e6642', mid: '#6e4d30', shade: '#4e3622' }
const DOOR = '#2a1c10'

/** A round house: a drum of daub, a dark door, and a tall cone of thatch overhanging it. */
function paintRoundHouse(p: P) {
  const { x0, y1, w } = p
  const cx = Math.round(x0 + w / 2)
  const half = Math.round(w / 2)
  const wallH = Math.max(4, Math.round(w * 0.45))
  const ground = Math.round(y1) - 1
  for (let r = 0; r < wallH; r++) {
    const y = ground - r
    for (let x = cx - half; x < cx + half; x++) {
      const k = (x - (cx - half)) / (half * 2)
      dot(p, x, y, k < 0.35 ? DAUB.lit : k < 0.75 ? DAUB.mid : DAUB.shade)
    }
  }
  const dw = Math.max(1, Math.round(w / 8))
  for (let r = 0; r < wallH - 1; r++) run(p, cx - dw, cx - 1, ground - r, DOOR)
  // The cone: a pixel wider than the wall on each side at the eave, rising to a point.
  const eave = ground - wallH
  const reach = half + 1
  const rh = Math.max(5, Math.round(w * 0.6))
  for (let r = 0; r < rh; r++) {
    const span = Math.max(0, Math.round(reach * (1 - r / rh)))
    const y = eave - r
    for (let x = cx - span; x < cx + span; x++) {
      const left = x < cx - span / 3
      const course = r % 3 === 2
      dot(p, x, y, left ? (course ? THATCH.mid : THATCH.lit) : course ? THATCH.shade : THATCH.mid)
    }
    if (span === 0) break
  }
  dot(p, cx - 1, eave - rh, TIMBER.shade)
}

/** A desert house: a mud-brick block with a flat roof and a white dome, behind a low courtyard wall. */
function paintCourtyardHouse(p: P) {
  const { x0, y1, w } = p
  const left = Math.round(x0)
  const right = Math.round(x0 + w) - 1
  const ground = Math.round(y1) - 1
  // The courtyard wall along the front, open at a gate in the middle.
  const gate = Math.round(x0 + w / 2) - 1
  for (let x = left; x <= right; x++) {
    if (x === gate || x === gate + 1) continue
    dot(p, x, ground, MUD.mid)
    dot(p, x, ground - 1, MUD.lit)
  }
  // The house behind it, set back two pixels: a block one shade darker on its right side.
  const bh = Math.max(4, Math.round(w * 0.55))
  const top = ground - 2 - bh
  for (let y = top; y < ground - 1; y++) {
    for (let x = left + 1; x <= right; x++) dot(p, x, y, x > right - Math.max(1, w / 5) ? MUD.shade : MUD.mid)
  }
  run(p, left, right, top, MUD.lit)
  // The door, seen through the gate, and a small dark window.
  run(p, gate, gate + 1, ground - 2, DOOR)
  run(p, gate, gate + 1, ground - 3, DOOR)
  dot(p, left + 2, top + 2, DOOR)
  // The dome, limewashed, on the left of the roof.
  const rd = Math.max(2, Math.round(w * 0.22))
  const dc = left + 1 + rd
  for (let dy = 0; dy <= rd; dy++) {
    const span = Math.round(Math.sqrt(rd * rd - dy * dy))
    for (let x = dc - span; x <= dc + span; x++) {
      dot(p, x, top - 1 - dy, x < dc ? LIME.lit : x === dc ? LIME.mid : LIME.shade)
    }
  }
}

/** A turf hall: long low timber walls under a heavy roof of turf, its grass hanging over the eaves. */
function paintTurfHall(p: P) {
  const { x0, y1, w } = p
  const left = Math.round(x0) - 1
  const right = Math.round(x0 + w)
  const ground = Math.round(y1) - 1
  const wallH = Math.max(3, Math.round(w * 0.28))
  for (let r = 0; r < wallH; r++) {
    for (let x = left + 1; x < right; x++)
      dot(p, x, ground - r, (x - left) % 3 === 0 ? TIMBER.shade : TIMBER.mid)
  }
  const doorX = Math.round(x0 + w * 0.3)
  for (let r = 0; r < wallH; r++) dot(p, doorX, ground - r, DOOR)
  // The roof: a low hump of turf from eave to ridge, wider than the walls, lit on top and shaded below.
  const eave = ground - wallH
  const rh = Math.max(4, Math.round(w * 0.42))
  for (let r = 0; r < rh; r++) {
    const inset = Math.round((r * r) / rh / 1.5)
    const y = eave - r
    for (let x = left + inset; x <= right - inset; x++) {
      dot(
        p,
        x,
        y,
        r === 0 ? TURF.shade : r >= rh - 2 ? TURF.lit : x < (left + right) / 2 ? TURF.lit : TURF.mid,
      )
    }
  }
  // Grass tufts hanging over the eave.
  for (let x = left + 1; x <= right - 1; x += 3) dot(p, x, eave + 1, TURF.shade)
}

const HOME_MAPS: Partial<Record<Exclude<HomeLand, ''>, HomeMap>> = {
  snow: IGLOO,
  stilt: STILT,
  longhouse: LONGHOUSE,
}

const HOME_PAINTERS: Partial<Record<Exclude<HomeLand, ''>, (p: P) => void>> = {
  round: paintRoundHouse,
  adobe: paintCourtyardHouse,
  turf: paintTurfHall,
}

/** Paints a land home. Returns false for a land with no home style of its own. */
export function paintLandHome(p: P): boolean {
  const land = p.land as Exclude<HomeLand, ''> | undefined
  if (!land) return false
  const painter = HOME_PAINTERS[land]
  if (painter) {
    painter(p)
    return true
  }
  const map = HOME_MAPS[land]
  if (!map) return false
  paintMap(p, map)
  return true
}
