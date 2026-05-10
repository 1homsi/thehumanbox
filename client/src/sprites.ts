// Kenney CC0 sprite atlases — see public/sprites/LICENSE-*.txt
// 16×16 tiles. Coords are [col, row] within the packed atlas.
//
// Tiny Town (192×176 = 12×11 tiles):
//   row 0: trunks + leafy / conifer / autumn trees
//   row 1: bushes, mushrooms
//   row 2-7: buildings (not used here)
//   row 8-10: characters (used as fallback human sprite)
//
// Tiny Creatures (160×288 = 10×18 tiles):
//   creature rows mixed; we pick specific tiles for our 7 animal kinds.

export const TILE_PX = 16

type Tile = readonly [number, number] // [col, row]

export const SPRITE = {
  trees: {
    // Forest / wetland / grassland: leafy round canopy variations
    oak_dark:    [4, 0] as Tile,
    oak_mid:     [3, 0] as Tile,
    oak_light:   [2, 0] as Tile,
    // Tundra / forest: pointed conifer
    conifer:     [5, 0] as Tile,
    conifer_dk:  [6, 0] as Tile,
    // Autumn (warm seasons / decline)
    autumn_red:  [7, 0] as Tile,
    autumn_yel:  [8, 0] as Tile,
    // Bush (low ground cover)
    bush:        [4, 1] as Tile,
    // Dead tree (volcanic / scorched)
    dead:        [11, 0] as Tile,
    // Cactus (desert)
    cactus:      [10, 0] as Tile,
  },
  human: {
    male:    [0, 8] as Tile,
    female:  [1, 8] as Tile,
    elder:   [2, 8] as Tile,
    child:   [3, 8] as Tile,
  },
  // Per-kind tile arrays. picKindTile() picks one deterministically by id
  // so two rabbits with different ids reliably look different but never
  // shimmer between sprites across reloads.
  animals: {
    rabbit: [[0, 13], [1, 13], [2, 13]] as Tile[],
    deer:   [[3, 13], [4, 13], [5, 13]] as Tile[],
    boar:   [[6, 13], [7, 13]] as Tile[],
    bird:   [[8, 13], [9, 13], [0, 14]] as Tile[],
    fish:   [[1, 17], [2, 17], [3, 17], [4, 17]] as Tile[],
    wolf:   [[5, 14], [6, 14], [7, 14]] as Tile[],
    dog:    [[8, 14], [9, 14], [0, 15]] as Tile[],
  },
  humans: [
    [0, 8] as Tile,
    [1, 8] as Tile,
    [2, 8] as Tile,
    [3, 8] as Tile,
    [4, 8] as Tile,
    [5, 8] as Tile,
    [6, 8] as Tile,
    [7, 8] as Tile,
  ],
} as const

function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return (h >>> 0)
}
function hashNum(n: number): number {
  let h = n | 0
  h = (h ^ (h >>> 16)) >>> 0
  h = Math.imul(h, 0x85ebca6b)
  h = (h ^ (h >>> 13)) >>> 0
  return h >>> 0
}

export function pickAnimalTile(kind: string, id: number): Tile {
  const list = (SPRITE.animals as Record<string, Tile[]>)[kind] ?? SPRITE.animals.rabbit
  return list[hashNum(id) % list.length]
}
export function pickHumanTile(id: string): Tile {
  return SPRITE.humans[hashStr(id) % SPRITE.humans.length]
}

const cache: Record<string, HTMLImageElement> = {}
const onLoad: Array<() => void> = []

export function onAnyAtlasLoaded(fn: () => void) {
  onLoad.push(fn)
  if (ATLAS_TOWN.complete && ATLAS_CREATURE.complete) fn()
}

export function loadAtlas(url: string): HTMLImageElement {
  if (cache[url]) return cache[url]
  const img = new Image()
  img.src = url
  img.addEventListener('load', () => onLoad.forEach(fn => fn()), { once: true })
  cache[url] = img
  return img
}

export const ATLAS_TOWN     = loadAtlas('/sprites/tiny-town.png')
export const ATLAS_CREATURE = loadAtlas('/sprites/tiny-creatures.png')

export function drawTile(
  ctx: CanvasRenderingContext2D,
  atlas: HTMLImageElement,
  tile: Tile,
  dx: number, dy: number,
  size = TILE_PX,
) {
  if (!atlas.complete || atlas.naturalWidth === 0) return
  const [col, row] = tile
  ctx.drawImage(
    atlas,
    col * TILE_PX, row * TILE_PX, TILE_PX, TILE_PX,
    dx, dy, size, size,
  )
}
