import { BIOME_ID } from '../../model/terrain-ids'
import type { P } from './kit'

/**
 * Stone-age homes follow the land they stand on: a snow igloo on the tundra
 * and in the taiga, a flat-roofed adobe hut in the deserts and badlands, a
 * stilt house over the wetland, and a long thatched longhouse in the forests
 * and jungle. Elsewhere the usual stone-age huts stand.
 */
export type HomeLand = 'snow' | 'adobe' | 'stilt' | 'longhouse' | ''

/** The local house style for a biome id (see BIOME_ID); '' keeps the default hut. */
export function homeLandOfBiome(biome: number): HomeLand {
  switch (biome) {
    case BIOME_ID.TUNDRA:
    case BIOME_ID.TAIGA:
      return 'snow'
    case BIOME_ID.DESERT:
    case BIOME_ID.BADLANDS:
      return 'adobe'
    case BIOME_ID.WETLAND:
      return 'stilt'
    case BIOME_ID.FOREST:
    case BIOME_ID.JUNGLE:
      return 'longhouse'
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

const ADOBE: HomeMap = {
  rows: ['oooooooo', 'pppppppp', 'oaaaaaao', 'oaakaaao', 'oaaaaaao', 'oaaakkao', 'oaaakkao', 'oooooooo'],
  colors: { o: '#3a2a1a', p: '#e8c896', a: '#c8a06c', k: '#3a2616' },
  drop: 0,
}

const STILT: HomeMap = {
  rows: [
    '..oooo..',
    '.oHHHHo.',
    'oHHHHHHo',
    'ohhhhhho',
    'oTTgTTto',
    'oTTddTto',
    'oTTddTto',
    'oTTTTTTo',
    'oooooooo',
    'l......l',
    'l......l',
    'l......l',
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

const HOME_MAPS: Record<Exclude<HomeLand, ''>, HomeMap> = {
  snow: IGLOO,
  adobe: ADOBE,
  stilt: STILT,
  longhouse: LONGHOUSE,
}

/** Paints a land home from its map. Returns false for a land with no home map. */
export function paintLandHome(p: P): boolean {
  const map = p.land ? HOME_MAPS[p.land as Exclude<HomeLand, ''>] : undefined
  if (!map) return false
  const cols = map.rows[0].length
  const x = p.x0 + Math.floor((p.w - cols) / 2)
  const bottom = p.y1 - 1 + map.drop
  map.rows.forEach((row, r) => {
    const y = bottom - (map.rows.length - 1 - r)
    for (let c = 0; c < row.length; c++) {
      const color = map.colors[row[c]]
      if (color) {
        p.ctx.fillStyle = color
        p.ctx.fillRect(x + c, y, 1, 1)
      }
    }
  })
  return true
}
