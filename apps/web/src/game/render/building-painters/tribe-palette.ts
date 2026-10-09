/**
 * Each tribe has one roof colour for its homes: brick, slate, moss or ochre.
 * The colour is chosen from the tribe's id, so a tribe keeps it for its whole
 * life and across eras, and two neighbouring tribes usually look different.
 */
export const TRIBE_ROOF_TINTS = ['#9a4a32', '#4f5f73', '#5f7040', '#b58a3c'] as const

/** Kinds that take their tribe's roof colour: the homes with pitched or thatched roofs. */
const TINTED_HOMES = new Set(['Hut', 'House', 'TownHouse', 'Manor'])

/** A 32-bit FNV-1a hash of a string: the same id always gives the same number. */
export function hashId(id: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Index into TRIBE_ROOF_TINTS for a tribe id. */
export function tribeTintIndex(lineageId: string): number {
  return hashId(lineageId) % TRIBE_ROOF_TINTS.length
}

/** The roof tint of a home of this kind, or undefined for buildings that keep their own roofs. */
export function roofTintFor(kind: string, lineageId: string): string | undefined {
  return TINTED_HOMES.has(kind) && lineageId ? TRIBE_ROOF_TINTS[tribeTintIndex(lineageId)] : undefined
}
