export interface MapCamera {
  x: number
  y: number
  zoom: number
}
export interface MapSize {
  w: number
  h: number
}
export type MapCommand =
  { kind: 'fit' } | { kind: 'zoom'; factor: number } | { kind: 'focus'; x: number; y: number }

/** Most a camera may zoom in. */
export const MAX_MAP_ZOOM = 8

/** Least a camera may zoom out: the whole world with a little sea around it. */
export function minMapZoom(world: MapSize, viewport: MapSize): number {
  return Math.min(viewport.w / world.w, viewport.h / world.h) * 0.85
}

/**
 * The opening view: the whole world, centred. Null until the viewport has
 * been measured, so the camera never starts fitted to a 0×0 box (zoom 0,
 * which showed nothing but open sea until the player found a way out).
 */
export function initialMapCamera(world: MapSize, viewport: MapSize): MapCamera | null {
  if (!(viewport.w > 0 && viewport.h > 0 && world.w > 0 && world.h > 0)) return null
  return { x: world.w / 2, y: world.h / 2, zoom: Math.min(viewport.w / world.w, viewport.h / world.h) * 0.95 }
}

export function clampMapCamera(camera: MapCamera, world: MapSize, viewport: MapSize): MapCamera {
  // A zoom of 0 (or NaN) would shrink the world to nothing: fall back to
  // the opening view rather than keep a camera that can never show land.
  if (!(camera.zoom > 0 && Number.isFinite(camera.zoom))) {
    const fit = initialMapCamera(world, viewport)
    if (!fit) return camera
    camera = { ...camera, zoom: fit.zoom }
  }
  const halfW = viewport.w / (2 * camera.zoom)
  const halfH = viewport.h / (2 * camera.zoom)
  return {
    ...camera,
    x: halfW >= world.w / 2 ? world.w / 2 : Math.max(halfW, Math.min(world.w - halfW, camera.x)),
    y: halfH >= world.h / 2 ? world.h / 2 : Math.max(halfH, Math.min(world.h - halfH, camera.y)),
  }
}

export function zoomMapAt(
  camera: MapCamera,
  zoom: number,
  point: { x: number; y: number },
  viewport: MapSize,
): MapCamera {
  const dx = point.x - viewport.w / 2
  const dy = point.y - viewport.h / 2
  return { x: camera.x + dx / camera.zoom - dx / zoom, y: camera.y + dy / camera.zoom - dy / zoom, zoom }
}

export function screenToMap(camera: MapCamera, point: { x: number; y: number }, viewport: MapSize) {
  return {
    x: camera.x + (point.x - viewport.w / 2) / camera.zoom,
    y: camera.y + (point.y - viewport.h / 2) / camera.zoom,
  }
}

export function isMapControl(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    !!target.closest('button, input, select, textarea, a, [contenteditable="true"], [data-map-ui]')
  )
}
