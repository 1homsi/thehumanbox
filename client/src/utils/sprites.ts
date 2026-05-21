

export const TILE_PX = 16

type Tile = readonly [number, number]

export const SPRITE = {
  trees: {
    oak_dark:    [4, 0] as Tile,
    oak_mid:     [3, 0] as Tile,
    oak_light:   [2, 0] as Tile,
    conifer:     [5, 0] as Tile,
    conifer_dk:  [6, 0] as Tile,
    autumn_red:  [7, 0] as Tile,
    autumn_yel:  [8, 0] as Tile,
    bush:        [4, 1] as Tile,
    dead:        [11, 0] as Tile,
    cactus:      [10, 0] as Tile,
  },
  human: {
    male:    [0, 8] as Tile,
    female:  [1, 8] as Tile,
    elder:   [2, 8] as Tile,
    child:   [3, 8] as Tile,
  },
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
  if (ATLAS_TOWN.complete && ATLAS_CREATURE.complete && ATLAS_PEOPLE.complete) fn()
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
export const ATLAS_PEOPLE   = loadAtlas('/sprites/people/people.svg')

export const PEOPLE_CELL = 32
export const PEOPLE_COLS = 4
export type AgeStage = 'infant' | 'child' | 'teen' | 'adult'
const STAGE_ROW: Record<AgeStage, number> = { infant: 0, child: 1, teen: 2, adult: 3 }

export function pickHumanSprite(sex: 'male' | 'female', stage: AgeStage, frame: number): Tile {
  const sexOffset = sex === 'female' ? 4 : 0
  const row = sexOffset + STAGE_ROW[stage]
  const col = ((frame % PEOPLE_COLS) + PEOPLE_COLS) % PEOPLE_COLS
  return [col, row] as Tile
}

export function drawPeopleTile(
  ctx: CanvasRenderingContext2D,
  tile: Tile,
  dx: number, dy: number,
  size: number,
) {
  const img = ATLAS_PEOPLE
  if (!img.complete || img.naturalWidth === 0) return false
  const [col, row] = tile
  ctx.drawImage(
    img,
    col * PEOPLE_CELL, row * PEOPLE_CELL, PEOPLE_CELL, PEOPLE_CELL,
    dx, dy, size, size,
  )
  return true
}

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
