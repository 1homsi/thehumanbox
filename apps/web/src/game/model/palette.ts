/**
 * Static palette tables for the 2D WorldView renderer. Extracted from
 * WorldView.tsx so the renderer file stays focused on draw orchestration.
 * These are pure-data modules - no side effects, no React, safe to
 * import from anywhere.
 */
import { GRASS, OCEAN, ROCK, SAND, SNOW, hex } from '../render/art-palette'

export const TILE = 8

/**
 * One colour per tile id, for the things that colour by tile alone (the small maps, the terrain atlas's
 * reference tones). All from the master palette (render/pixel-art/palette.ts). The map itself colours
 * land by biome and season: see render/base-parts/ground-palette.ts.
 */
const TILE_COLORS: Record<number, string> = {
  0: '#090a14',
  1: hex(GRASS.base),
  2: hex(OCEAN.open),
  3: hex(GRASS.light),
  4: '#cf573c',
  5: hex(ROCK.mid),
  6: hex(ROCK.shade),
  7: '#da863e',
  8: '#884b2b',
  9: hex(OCEAN.shallows),
  10: '#de9e41',
  11: '#4d2b32',
  12: hex(SNOW.lit),
  13: hex(SAND.light),
  14: '#cf573c',
  15: '#a4dddb',
}

function parseHex(h: string): [number, number, number] {
  const s = h.replace('#', '')
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)]
}

export const TILE_RGB: Record<number, [number, number, number]> = Object.fromEntries(
  Object.entries(TILE_COLORS).map(([k, v]) => [+k, parseHex(v)]),
)

export const THOUGHT_COLORS: Record<string, string> = {
  eating: '#6abf45',
  drinking: '#4499ff',
  'heat dangerous': '#e8450a',
  'hungry - searching': '#cc8800',
  'thirsty - searching': '#0099cc',
  'moving to known food': '#aadd55',
  'moving to known water': '#55aaff',
  'avoiding danger': '#ff6644',
  dying: '#ff0000',
  satisfied: '#ffffff',
  socializing: '#ffdd88',
  wary: '#ff9900',
  'signaling food': '#ffff44',
  'sounding alarm': '#ff4488',
  challenging: '#ff2200',
  'challenging alone': '#cc4422',
  exploring: '#888888',
  observing: '#555555',
  'feeling weak': '#bbff44',
  'coexisting peacefully': '#55ff88',
  hunting: '#ffaa22',
  gathering: '#c8a050',
  building: '#ffcc44',
  'building shelter': '#ffd700',
  'digging for water': '#3a9bd4',
  'digging in the sand': '#d9c07a',
  'struck water': '#33ddff',
  'tilling the soil': '#8a6a3a',
  'foraging wild food': '#7ed957',
  'foraging the brush': '#9bc850',
  'searching the brush': '#a8b86a',
  'dancing with kin': '#ff7fd4',
  'dancing by the fire': '#ff9ae0',
  'dancing alone': '#c885b0',
  singing: '#a98fff',
  'singing by the fire': '#bda6ff',
  'reflecting quietly': '#8fd4c4',
  'taking a quiet moment': '#9fd9ca',
  'storing food': '#d4b34a',
  'eating stored food': '#c8d96a',
  'scouting the area': '#6fc0e8',
  'surveying the land': '#7fcaf0',
  'marking territory': '#e0a040',
  'marking the homeland': '#e8b050',
}
