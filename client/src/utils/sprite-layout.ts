export const TILE_PX = 16

export type Tile = readonly [column: number, row: number]

export const CREATURE_ATLAS = {
  width: 160,
  height: 288,
  columns: 10,
  rows: 18,
  cell: TILE_PX,
} as const

const RABBIT_TILES = [[7, 17]] as const satisfies readonly Tile[]
const DEER_TILES = [[1, 16]] as const satisfies readonly Tile[]
const BOAR_TILES = [[0, 16]] as const satisfies readonly Tile[]
const FISH_TILES = [
  [0, 6],
  [1, 6],
  [2, 6],
  [3, 6],
  [4, 6],
  [0, 7],
  [1, 7],
  [2, 7],
  [3, 7],
  [4, 7],
] as const satisfies readonly Tile[]
const BIRD_TILES = [
  [0, 13],
  [1, 13],
  [4, 13],
  [5, 13],
] as const satisfies readonly Tile[]

export const SPRITE = {
  trees: {
    oak_dark: [4, 0] as Tile,
    oak_mid: [3, 0] as Tile,
    oak_light: [2, 0] as Tile,
    conifer: [5, 0] as Tile,
    conifer_dk: [6, 0] as Tile,
    autumn_red: [7, 0] as Tile,
    autumn_yel: [8, 0] as Tile,
    bush: [4, 1] as Tile,
    dead: [11, 0] as Tile,
    cactus: [10, 0] as Tile,
  },
  animals: {
    rabbit: RABBIT_TILES,
    deer: DEER_TILES,
    boar: BOAR_TILES,
    bird: BIRD_TILES,
    fish: FISH_TILES,
  },
} as const

export const CUSTOM_PIXEL_ANIMAL_KINDS = ['wolf', 'dog'] as const

export type AtlasAnimalSpriteKind = keyof typeof SPRITE.animals
export type CustomPixelAnimalKind = (typeof CUSTOM_PIXEL_ANIMAL_KINDS)[number]
export type AnimalSpriteKind = AtlasAnimalSpriteKind | CustomPixelAnimalKind

const customPixelAnimalKinds = new Set<string>(CUSTOM_PIXEL_ANIMAL_KINDS)

function hashNumber(value: number): number {
  let hash = value | 0
  hash = (hash ^ (hash >>> 16)) >>> 0
  hash = Math.imul(hash, 0x85ebca6b)
  hash = (hash ^ (hash >>> 13)) >>> 0
  return hash >>> 0
}

export function pickAnimalTile(kind: string, id: number): Tile | null {
  if (customPixelAnimalKinds.has(kind)) return null

  const pools = SPRITE.animals as Record<string, readonly Tile[]>
  const pool = pools[kind] ?? SPRITE.animals.rabbit
  return pool[hashNumber(id) % pool.length]
}
