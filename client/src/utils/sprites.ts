import {
  HUMAN_ATLAS_CELL,
  HUMAN_ATLAS_FRAMES,
  humanAtlasRow,
  wrapHumanFrame,
  type AgeStage,
  type HumanSex,
} from '../2d/world/character-visuals'
import { pickAnimalTile, SPRITE, TILE_PX, type Tile } from './sprite-layout'
import { rasterizedAtlas } from './rasterized-atlas'

export { pickAnimalTile, SPRITE, TILE_PX }
export type { AgeStage, Tile }

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
  img.addEventListener('load', () => onLoad.forEach((fn) => fn()), { once: true })
  cache[url] = img
  return img
}

export const ATLAS_TOWN = loadAtlas(`${import.meta.env.BASE_URL}sprites/tiny-town.png`)
export const ATLAS_CREATURE = loadAtlas(`${import.meta.env.BASE_URL}sprites/tiny-creatures.png`)
export const ATLAS_PEOPLE = loadAtlas(`${import.meta.env.BASE_URL}sprites/people/people.svg`)

export const PEOPLE_CELL = HUMAN_ATLAS_CELL
export const PEOPLE_COLS = HUMAN_ATLAS_FRAMES

export function pickHumanSprite(sex: HumanSex, stage: AgeStage, frame: number, appearance = 0): Tile {
  return [wrapHumanFrame(frame), humanAtlasRow(sex, stage, appearance)]
}

const mirroredPeople = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>()

/** Resolve the current atlas once per population pass, including load/source changes. */
export function getPeopleAtlas(): HTMLCanvasElement | null {
  return rasterizedAtlas(ATLAS_PEOPLE)
}

export function drawPeopleTile(
  ctx: CanvasRenderingContext2D,
  tile: Tile,
  dx: number,
  dy: number,
  size: number,
  flipped = false,
  atlas: HTMLCanvasElement | null = getPeopleAtlas(),
) {
  const img = atlas
  if (!img) return false
  const [col, row] = tile
  let source = img
  let sx = col * PEOPLE_CELL
  if (flipped) {
    let mirrored = mirroredPeople.get(img)
    if (!mirrored) {
      mirrored = document.createElement('canvas')
      mirrored.width = img.width
      mirrored.height = img.height
      const mirrorCtx = mirrored.getContext('2d')
      if (!mirrorCtx) return false
      mirrorCtx.translate(img.width, 0)
      mirrorCtx.scale(-1, 1)
      mirrorCtx.drawImage(img, 0, 0)
      mirroredPeople.set(img, mirrored)
    }
    source = mirrored
    sx = img.width - (col + 1) * PEOPLE_CELL
  }
  const smoothing = ctx.imageSmoothingEnabled
  if (smoothing) ctx.imageSmoothingEnabled = false
  ctx.drawImage(source, sx, row * PEOPLE_CELL, PEOPLE_CELL, PEOPLE_CELL, dx, dy, size, size)
  if (smoothing) ctx.imageSmoothingEnabled = true
  return true
}

export function drawTile(
  ctx: CanvasRenderingContext2D,
  atlas: HTMLImageElement,
  tile: Tile,
  dx: number,
  dy: number,
  size = TILE_PX,
) {
  if (!atlas.complete || atlas.naturalWidth === 0) return
  const [col, row] = tile
  ctx.drawImage(atlas, col * TILE_PX, row * TILE_PX, TILE_PX, TILE_PX, dx, dy, size, size)
}
