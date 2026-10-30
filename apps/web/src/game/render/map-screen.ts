import { TILE } from '../model/palette'
import type { MapCamera, MapSize } from './camera-controls'

/** Where a tile's centre sits on screen: the same projection as the brush ring and the lettering. */
export function tileOnScreen(
  tile: readonly [number, number],
  origin: { x: number; y: number },
  camera: MapCamera,
  viewport: MapSize,
): { x: number; y: number } {
  return {
    x: ((tile[0] - origin.x + 0.5) * TILE - camera.x) * camera.zoom + viewport.w / 2,
    y: ((tile[1] - origin.y + 0.5) * TILE - camera.y) * camera.zoom + viewport.h / 2,
  }
}
