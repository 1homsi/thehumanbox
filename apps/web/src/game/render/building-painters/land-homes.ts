import { BIOME_ID } from '../../model/terrain-ids'

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
