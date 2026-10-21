import { SAND, ROCK, SNOW, FOREST, OCEAN, BIOME_TONES, hex } from '../../art-palette'

/**
 * What a person wears or carries for their trade, as a few solid pixels on the sprite: a straw hat for a
 * farmer, a steel helmet for a soldier, a hammer for a smith. A person with no trade (or a trade with no
 * mark) is drawn bare. Positions are in sprite pixels, measured from the centre of the head's top edge:
 * `x` to the right, `y` down, so the same mark sits on the head of any figure.
 */

/** One solid rectangle of a mark: its top-left corner, size and colour (`#rrggbb`). */
export interface ProfessionPixels {
  x: number
  y: number
  w: number
  h: number
  color: string
}

const HAT: Record<string, ProfessionPixels[]> = {
  // Straw hat with a wide brim, gold.
  farmer: [
    { x: -2, y: 1, w: 6, h: 1, color: hex(SAND.dune) },
    { x: -2, y: -1, w: 4, h: 1, color: hex(SAND.light) },
  ],
  // Leather cap.
  smith: [{ x: -2, y: -1, w: 4, h: 1, color: hex(ROCK.deep) }],
  // Steel helmet with a brim.
  soldier: [
    { x: -2, y: -2, w: 5, h: 2, color: hex(ROCK.lit) },
    { x: -2, y: 0, w: 6, h: 1, color: hex(ROCK.shade) },
  ],
  // Tall white mitre with a gold band.
  priest: [
    { x: -2, y: -4, w: 4, h: 3, color: hex(SNOW.lit) },
    { x: -2, y: -1, w: 6, h: 1, color: hex(SAND.desert) },
  ],
  // White cap with a red cross.
  healer: [
    { x: -2, y: -1, w: 4, h: 1, color: hex(SNOW.lit) },
    { x: 0, y: -1, w: 1, h: 2, color: hex(BIOME_TONES.badlands) },
  ],
  // Brown felt hat.
  merchant: [{ x: -2, y: -1, w: 5, h: 2, color: hex(SAND.dune) }],
  // Dark scholar's cap.
  scholar: [{ x: -2, y: -1, w: 4, h: 1, color: hex(ROCK.deep) }],
  // White baker's cap.
  baker: [{ x: -2, y: -1, w: 4, h: 1, color: hex(SNOW.lit) }],
  // Yellow hard hat with a lamp.
  miner: [
    { x: -2, y: -1, w: 5, h: 2, color: hex(SAND.desert) },
    { x: 0, y: -2, w: 1, h: 1, color: hex(SAND.light) },
  ],
  // Yellow hard hat for the building trades.
  builder: [{ x: -2, y: -1, w: 5, h: 2, color: hex(SAND.desert) }],
  mason: [{ x: -2, y: -1, w: 5, h: 2, color: hex(SAND.desert) }],
  carpenter: [{ x: -2, y: -1, w: 5, h: 2, color: hex(SAND.desert) }],
  // Green hunter's cap with a white feather.
  hunter: [
    { x: -2, y: -1, w: 4, h: 1, color: hex(FOREST.mid) },
    { x: 2, y: -4, w: 1, h: 3, color: hex(SNOW.lit) },
  ],
  // Blue sailor's cap.
  sailor: [{ x: -2, y: -1, w: 4, h: 1, color: hex(OCEAN.open) }],
  // Beret.
  artist: [{ x: -2, y: -1, w: 5, h: 2, color: hex(BIOME_TONES.badlands) }],
  // Beige cap.
  brewer: [{ x: -2, y: -1, w: 4, h: 1, color: hex(SAND.light) }],
  // Headscarf.
  weaver: [{ x: -2, y: -1, w: 5, h: 2, color: hex(BIOME_TONES.badlands) }],
}

/** A tool held at the side: a handle with a head, at `x` pixels from the centre of the body. */
const HELD: Record<string, ProfessionPixels[]> = {
  smith: [
    { x: 0, y: -4, w: 1, h: 6, color: hex(SAND.dune) },
    { x: -1, y: -5, w: 3, h: 2, color: hex(ROCK.shade) },
  ],
  miner: [
    { x: 0, y: -4, w: 1, h: 6, color: hex(SAND.dune) },
    { x: -2, y: -5, w: 4, h: 1, color: hex(ROCK.lit) },
  ],
}

/** The worn and held marks of one person: worn marks are measured from the top of the head, held ones from the hand. */
export interface ProfessionMarks {
  worn: ProfessionPixels[]
  held: ProfessionPixels[]
}

/**
 * The marks a person of `specialty` wears (on the head) and holds (at the side of the body, `handX` pixels
 * from the centre). Nothing for a person with no trade or one with no mark.
 */
export function professionMarks(specialty: string | undefined, handX: number): ProfessionMarks {
  if (!specialty) return { worn: [], held: [] }
  return {
    worn: HAT[specialty] ?? [],
    held: (HELD[specialty] ?? []).map((p) => ({ ...p, x: p.x + Math.round(handX) })),
  }
}

/** Every mark of a person, worn and held together. */
export function professionPixels(specialty: string | undefined, handX: number): ProfessionPixels[] {
  const { worn, held } = professionMarks(specialty, handX)
  return worn.concat(held)
}
