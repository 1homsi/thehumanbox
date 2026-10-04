import {
  initialMapCamera,
  MAX_MAP_ZOOM,
  minMapZoom,
  zoomMapAt,
  type MapCamera,
  type MapCommand,
  type MapSize,
} from '../../camera-controls'

/** Zoom per wheel pixel, exponential. The 2D map has always used 0.0025. */
export const WHEEL_SPEED = 0.0025
/** World pixels per second the arrow keys and WASD pan at zoom 1. */
export const KEY_PAN_SPEED = 480
/** One press of + or - zooms by this factor. */
export const KEY_ZOOM_STEP = 1.2

const PAN_KEYS = new Set(['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'])

export function panKey(key: string): boolean {
  return PAN_KEYS.has(key)
}

/** How far the held keys move the camera in `dt` seconds, in map pixels. Diagonals are not faster. */
export function keyboardPanDelta(
  keys: ReadonlySet<string>,
  dt: number,
  zoom: number,
): { x: number; y: number } {
  const x = Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'))
  const y = Number(keys.has('s') || keys.has('arrowdown')) - Number(keys.has('w') || keys.has('arrowup'))
  const step = (KEY_PAN_SPEED * dt) / zoom / (Math.hypot(x, y) || 1)
  return { x: x * step, y: y * step }
}

/**
 * Where a camera request ("fit the world", "zoom by", "look at") puts the
 * camera, before it is clamped. Null when the request cannot be served yet
 * (the viewport has not been measured).
 */
export function commandCamera(
  command: MapCommand,
  current: MapCamera,
  world: MapSize,
  viewport: MapSize,
): MapCamera | null {
  if (command.kind === 'fit') return initialMapCamera(world, viewport)
  if (command.kind === 'zoom') {
    const zoom = Math.max(minMapZoom(world, viewport), Math.min(MAX_MAP_ZOOM, current.zoom * command.factor))
    return zoomMapAt(current, zoom, { x: viewport.w / 2, y: viewport.h / 2 }, viewport)
  }
  return { x: command.x, y: command.y, zoom: Math.max(current.zoom, 2) }
}
