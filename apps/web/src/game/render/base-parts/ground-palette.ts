import { BIOME_ID, TILE_ID } from '../../model/terrain-ids'
import { C, PALETTE_RGB } from '../pixel-art/palette.ts'

/** A ground colour: one of the master palette's, as `[r, g, b]`. */
export type Tone = readonly [number, number, number]

const tone = (index: number): Tone => PALETTE_RGB[index]

/**
 * The ground of each biome, as two flat tones: the land itself and the patches that break it up (drier
 * grass, darker thicket, frost, dunes). Both are colours of the master palette, picked, not mixed: the
 * ground used to be a tile colour blended with a biome tint, a season tint and a shade of noise, which
 * gave every tile a slightly different olive and the map the look of a filtered photograph.
 */
const BIOME_GROUND: Record<number, readonly [Tone, Tone]> = {
  [BIOME_ID.GRASSLAND]: [tone(C.green3), tone(C.green2)],
  [BIOME_ID.FOREST]: [tone(C.green2), tone(C.green2)],
  [BIOME_ID.JUNGLE]: [tone(C.green1), tone(C.green2)],
  [BIOME_ID.WETLAND]: [tone(C.grey5), tone(C.green1)],
  [BIOME_ID.TAIGA]: [tone(C.grey6), tone(C.grey5)],
  [BIOME_ID.TUNDRA]: [tone(C.grey7), tone(C.grey8)],
  [BIOME_ID.SAVANNA]: [tone(C.gold5), tone(C.green4)],
  [BIOME_ID.DESERT]: [tone(C.tan5), tone(C.tan4)],
  [BIOME_ID.BADLANDS]: [tone(C.tan3), tone(C.tan2)],
  [BIOME_ID.VOLCANIC]: [tone(C.grey4), tone(C.grey3)],
}

/** In autumn the open grass yellows; the woods keep their ground and change their leaves instead. */
const AUTUMN_GROUND: Record<number, readonly [Tone, Tone]> = {
  [BIOME_ID.GRASSLAND]: [tone(C.green4), tone(C.gold5)],
  [BIOME_ID.SAVANNA]: [tone(C.gold5), tone(C.gold4)],
}

/** In winter the open grass pales to straw. */
const WINTER_GROUND: Record<number, readonly [Tone, Tone]> = {
  [BIOME_ID.GRASSLAND]: [tone(C.green5), tone(C.green4)],
  [BIOME_ID.SAVANNA]: [tone(C.tan5), tone(C.gold5)],
}

/** A hard winter frosts every green thing white. */
const FROST: readonly [Tone, Tone] = [tone(C.grey8), tone(C.grey9)]
const FROSTED = new Set<number>([
  BIOME_ID.GRASSLAND,
  BIOME_ID.FOREST,
  BIOME_ID.JUNGLE,
  BIOME_ID.WETLAND,
  BIOME_ID.TAIGA,
  BIOME_ID.TUNDRA,
  BIOME_ID.SAVANNA,
])

/** Ground that is not grass: the same in every biome and season. */
const TILE_GROUND: Record<number, Tone> = {
  [TILE_ID.VOID]: tone(C.grey0),
  [TILE_ID.ROCK]: tone(C.grey6),
  // Ash is bare earth where the grass burnt off: a brown that sits in a meadow, not a slate square punched in it.
  [TILE_ID.ASH]: tone(C.tan2),
  [TILE_ID.FLOODED]: tone(C.blue3),
  [TILE_ID.SCORCHED]: tone(C.tan0),
  [TILE_ID.SNOW]: tone(C.grey9),
  [TILE_ID.SAND]: tone(C.tan5),
  [TILE_ID.LAVA]: tone(C.red4),
  [TILE_ID.ICE]: tone(C.blue5),
}

/**
 * The flat colour of a land tile. `baseTid` is the tile's base terrain (see `baseTerrainTile`); `patch`
 * says whether the tile lies in one of its biome's patches. Grass takes its biome's ground, shifted by
 * the season; everything else has one colour.
 */
export function groundTone(baseTid: number, biome: number, season: string | undefined, patch: boolean): Tone {
  if (baseTid !== TILE_ID.GRASS) return TILE_GROUND[baseTid] ?? TILE_GROUND[TILE_ID.VOID]
  let pair = BIOME_GROUND[biome] ?? BIOME_GROUND[BIOME_ID.GRASSLAND]
  if (season === 'hard_winter' && FROSTED.has(biome)) pair = FROST
  else if (season === 'decline') pair = AUTUMN_GROUND[biome] ?? pair
  else if (season === 'scarcity') pair = WINTER_GROUND[biome] ?? pair
  return pair[patch ? 1 : 0]
}
