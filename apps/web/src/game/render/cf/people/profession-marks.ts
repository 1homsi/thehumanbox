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
    { x: -5, y: 1, w: 10, h: 1, color: '#c9a445' },
    { x: -3, y: -1, w: 6, h: 2, color: '#e6c766' },
  ],
  // Leather cap.
  smith: [{ x: -3, y: -1, w: 6, h: 2, color: '#5b3a22' }],
  // Steel helmet with a brim.
  soldier: [
    { x: -4, y: -2, w: 8, h: 2, color: '#a7b0ba' },
    { x: -5, y: 0, w: 10, h: 1, color: '#6d757e' },
  ],
  // Tall white mitre with a gold band.
  priest: [
    { x: -2, y: -4, w: 4, h: 3, color: '#f4f1e8' },
    { x: -3, y: -1, w: 6, h: 1, color: '#f2c84b' },
  ],
  // White cap with a red cross.
  healer: [
    { x: -3, y: -1, w: 6, h: 2, color: '#f7f7f2' },
    { x: 0, y: -1, w: 1, h: 2, color: '#d6453d' },
  ],
  // Brown felt hat.
  merchant: [{ x: -4, y: -1, w: 8, h: 2, color: '#7a4f2a' }],
  // Dark scholar's cap.
  scholar: [{ x: -3, y: -1, w: 6, h: 2, color: '#2b2b3c' }],
  // White baker's cap.
  baker: [{ x: -3, y: -1, w: 6, h: 2, color: '#f7f7f2' }],
  // Yellow hard hat with a lamp.
  miner: [
    { x: -4, y: -1, w: 8, h: 2, color: '#e8c23a' },
    { x: 0, y: -2, w: 1, h: 1, color: '#fff8c0' },
  ],
  // Yellow hard hat for the building trades.
  builder: [{ x: -4, y: -1, w: 8, h: 2, color: '#f0b429' }],
  mason: [{ x: -4, y: -1, w: 8, h: 2, color: '#f0b429' }],
  carpenter: [{ x: -4, y: -1, w: 8, h: 2, color: '#f0b429' }],
  // Green hunter's cap with a white feather.
  hunter: [
    { x: -3, y: -1, w: 6, h: 2, color: '#4f7a3a' },
    { x: 2, y: -4, w: 1, h: 3, color: '#f4f1e8' },
  ],
  // Blue sailor's cap.
  sailor: [{ x: -3, y: -1, w: 6, h: 2, color: '#3b6fb6' }],
  // Beret.
  artist: [{ x: -3, y: -1, w: 7, h: 2, color: '#8e3b8e' }],
  // Beige cap.
  brewer: [{ x: -3, y: -1, w: 6, h: 2, color: '#d9b77a' }],
  // Headscarf.
  weaver: [{ x: -3, y: -1, w: 7, h: 2, color: '#b8475f' }],
}

/** A tool held at the side: a handle with a head, at `x` pixels from the centre of the body. */
const HELD: Record<string, ProfessionPixels[]> = {
  smith: [
    { x: 0, y: -4, w: 1, h: 6, color: '#b38b52' },
    { x: -1, y: -5, w: 3, h: 2, color: '#8d8d8d' },
  ],
  miner: [
    { x: 0, y: -4, w: 1, h: 6, color: '#b38b52' },
    { x: -2, y: -5, w: 4, h: 1, color: '#b5b5a5' },
  ],
}

/**
 * The marks a person of `specialty` wears (on the head) and holds (at the side of the body, `handX` pixels
 * from the centre). Returns nothing for a person with no trade or one with no mark.
 */
export function professionPixels(specialty: string | undefined, handX: number): ProfessionPixels[] {
  if (!specialty) return []
  const worn = HAT[specialty] ?? []
  const held = HELD[specialty] ?? []
  if (held.length === 0) return worn
  return worn.concat(held.map((p) => ({ ...p, x: p.x + Math.round(handX) })))
}
