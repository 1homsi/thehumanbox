import type { SpriteLayer } from 'cubeforge'
import type { WorldState } from '../../../shared/types'
import { TILE } from '../../model/palette'
import { zoomDetailLevel } from '../character-visuals'
import type { BuildingVisualDetail } from '../building-draw/types'

/** One frame's inputs for every cubeforge layer driver. */
export interface CfFrame {
  world: WorldState
  /** Wire grids are delta-merged, so biomes and depth are cached by the caller. */
  biomes: number[][] | undefined
  camera: { x: number; y: number; zoom: number }
  /** Pixel size of the map viewport. */
  viewport: { w: number; h: number }
  /** Wall clock in ms (animation phase). */
  now: number
  ox: number
  oy: number
  detail: BuildingVisualDetail
  /** Visible window in tiles (inclusive-exclusive), margin included. */
  win: { c0: number; c1: number; r0: number; r1: number }
}

export function makeFrame(
  world: WorldState,
  biomes: number[][] | undefined,
  camera: { x: number; y: number; zoom: number },
  viewport: { w: number; h: number },
  now: number,
  margin: number,
): CfFrame {
  const zoom = Math.max(0.01, camera.zoom)
  const halfW = viewport.w / 2 / zoom
  const halfH = viewport.h / 2 / zoom
  const { width, height } = world.grid
  return {
    world,
    biomes,
    camera,
    viewport,
    now,
    ox: world.grid.origin_x ?? 0,
    oy: world.grid.origin_y ?? 0,
    detail: zoomDetailLevel(camera.zoom),
    win: {
      c0: Math.max(0, Math.floor((camera.x - halfW) / TILE) - margin),
      c1: Math.min(width, Math.ceil((camera.x + halfW) / TILE) + margin),
      r0: Math.max(0, Math.floor((camera.y - halfH) / TILE) - margin),
      r1: Math.min(height, Math.ceil((camera.y + halfH) / TILE) + margin),
    },
  }
}

/** A layer driver writes world data into a SpriteLayer; true means sprites changed. */
export interface CfDriver {
  update(f: CfFrame): boolean
}

/** Pack 0..255 channels into the layer's 0xRRGGBBAA tint. */
export function rgba(r: number, g: number, b: number, a: number): number {
  return (((r & 255) << 24) | ((g & 255) << 16) | ((b & 255) << 8) | (a & 255)) >>> 0
}

export const WHITE = 0xffffffff

/** Per-sprite write helper: fills every array slot of sprite `i`. */
export function writeSprite(
  l: SpriteLayer,
  i: number,
  x: number,
  y: number,
  w: number,
  h: number,
  atlas: number,
  frame: number,
  color: number,
  flags: number,
  sortKey: number,
  id: number,
  rotation = 0,
): void {
  l.x[i] = x
  l.y[i] = y
  l.w[i] = w
  l.h[i] = h
  l.atlas[i] = atlas
  l.frame[i] = frame
  l.color[i] = color
  l.flags[i] = flags
  l.sortKey[i] = sortKey
  l.ids[i] = id
  l.rotation[i] = rotation
}
