/**
 * Each tribe has one roof colour for its homes: terracotta, slate, moss or ochre, muted to sit with the map's palette.
 * The colour is chosen from the tribe's id, so a tribe keeps it for its whole
 * life and across eras, and two neighbouring tribes usually look different.
 */
export const TRIBE_ROOF_TINTS = ['#93513a', '#56646b', '#66793f', '#ad8a45'] as const

/** Kinds that take their tribe's roof colour: the homes with pitched or thatched roofs. */
const TINTED_HOMES = new Set(['Hut', 'House', 'Longhouse', 'TownHouse', 'Manor'])

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

/**
 * The roof colour of each kind of building that is not a home, by what it is for, so a village reads at a
 * glance: gold straw on the stores, slate on the workshops, green-blue on the temples, blue on the halls of
 * government and learning, red on the market and the inns. Homes take their tribe's colour instead.
 */
export const KIND_ROOF_TINTS = {
  store: '#c49a3e',
  craft: '#4e5a66',
  faith: '#3f7f78',
  hall: '#46598c',
  trade: '#a8432f',
} as const

const KIND_ROOF: Record<string, keyof typeof KIND_ROOF_TINTS> = {
  Granary: 'store',
  Barn: 'store',
  Silo: 'store',
  Warehouse: 'store',
  Workshop: 'craft',
  Smithy: 'craft',
  Forge: 'craft',
  Sawmill: 'craft',
  Tannery: 'craft',
  Temple: 'faith',
  Cathedral: 'faith',
  Chapel: 'faith',
  Church: 'faith',
  Monastery: 'faith',
  GuildHall: 'hall',
  CityHall: 'hall',
  Courthouse: 'hall',
  School: 'hall',
  Library: 'hall',
  University: 'hall',
  Market: 'trade',
  Tavern: 'trade',
  Inn: 'trade',
  Bakery: 'trade',
}

/** The roof tint of a building of this kind, or undefined for buildings that keep their own roofs. */
export function roofTintFor(kind: string, lineageId: string): string | undefined {
  if (TINTED_HOMES.has(kind)) return lineageId ? TRIBE_ROOF_TINTS[tribeTintIndex(lineageId)] : undefined
  const use = KIND_ROOF[kind]
  return use ? KIND_ROOF_TINTS[use] : undefined
}
