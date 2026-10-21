/**
 * Static palette tables for the 2D WorldView renderer. Extracted from
 * WorldView.tsx so the renderer file stays focused on draw orchestration.
 * These are pure-data modules - no side effects, no React, safe to
 * import from anywhere.
 */
import { BIOME_TONES, FOREST, GRASS, OCEAN, ROCK, SAND, SNOW, hex, type Rgb } from '../render/art-palette'

export const TILE = 8

/**
 * Ground colour per tile id, before the biome tint, the season and the texture. Earthy and muted to
 * match the interface (render/art-palette.ts): olive grass, parchment sand, warm stone.
 */
export const TILE_COLORS: Record<number, string> = {
  0: '#0a0a0a',
  1: hex(GRASS.base),
  2: hex(OCEAN.open),
  3: hex(GRASS.light),
  4: '#e8450a',
  5: hex(ROCK.mid),
  6: '#5c564a',
  7: '#cc6600',
  8: '#8b6914',
  // Floodwater: muddy, between the river's green and the soil.
  9: '#62796a',
  10: '#c8a020',
  11: '#2a2018',
  12: hex(SNOW.lit),
  13: hex(SAND.light),
  14: '#d9461c',
  15: '#c6d6d3',
}

/** Wetland ground: reed olive gone brown with mud. */
const MARSH: Rgb = [104, 102, 70]
/** Jungle: a deeper, wetter green than the forest's moss. */
const JUNGLE: Rgb = [40, 86, 40]
/** Taiga: the forest's green gone cold and blue. */
const TAIGA: Rgb = [58, 84, 84]

/**
 * Each biome's tint over the ground, as `rgba(r,g,b,strength)`. Every biome has its own hue so
 * neighbouring biomes stay apart: moss forest, deep wet jungle, cold blue-green taiga, gold savanna,
 * rust badlands, ochre desert, grey-green tundra, reed-olive wetland, ash-dark volcanic land.
 */
export const BIOME_OVERLAYS: Record<number, string> = {
  0: tone(GRASS.lush, 0.2),
  1: tone(FOREST.mid, 0.62),
  2: tone(SAND.desert, 0.62),
  3: tone(MARSH, 0.62),
  4: tone(BIOME_TONES.tundra, 0.55),
  5: tone(BIOME_TONES.volcanic, 0.72),
  6: tone(JUNGLE, 0.66),
  7: tone(BIOME_TONES.savanna, 0.55),
  8: tone(TAIGA, 0.62),
  9: tone(BIOME_TONES.badlands, 0.62),
}

function tone([r, g, b]: Rgb, strength: number): string {
  return `rgba(${r},${g},${b},${strength})`
}

export function parseHex(h: string): [number, number, number] {
  const s = h.replace('#', '')
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)]
}

export function parseRgbaStr(s: string): [number, number, number, number] {
  const m = s.match(/[\d.]+/g)!
  return [+m[0], +m[1], +m[2], +m[3]]
}

export const TILE_RGB: Record<number, [number, number, number]> = Object.fromEntries(
  Object.entries(TILE_COLORS).map(([k, v]) => [+k, parseHex(v)]),
)

export const BIOME_RGBA: Record<number, [number, number, number, number]> = Object.fromEntries(
  Object.entries(BIOME_OVERLAYS).map(([k, v]) => [+k, parseRgbaStr(v)]),
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

/** How each season colours the grassy ground: summer's deep olive, spring's sage, autumn's ochre, winter's straw. */
export const SEASON_LAND_TINT: Record<string, { rgb: [number, number, number]; w: number }> = {
  abundance: { rgb: [98, 122, 58], w: 0.2 },
  recovery: { rgb: [124, 146, 80], w: 0.26 },
  decline: { rgb: [168, 132, 64], w: 0.44 },
  scarcity: { rgb: [138, 120, 88], w: 0.52 },
  /** A hard winter: frost over everything. */
  hard_winter: { rgb: [208, 212, 204], w: 0.6 },
}
