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

/** How much one double-click zooms the map: twice as close, or with Shift twice as far. */
export const DOUBLE_CLICK_ZOOM = 2
/** How long the double-click zoom takes to settle, in milliseconds. */
export const DOUBLE_CLICK_ZOOM_MS = 180

/**
 * The zoom a double-click aims for from `zoom`, kept within the map's limits. A double-click is the
 * zoom a laptop trackpad can always make: scrolling to zoom is awkward on one.
 */
export function doubleClickZoomTarget(zoom: number, out: boolean, min: number, max: number): number {
  return Math.max(min, Math.min(max, out ? zoom / DOUBLE_CLICK_ZOOM : zoom * DOUBLE_CLICK_ZOOM))
}

/**
 * The zoom `elapsed` ms into a double-click zoom from `from` to `to`: eased out, and stepped evenly in
 * scale rather than in raw zoom, so the map does not seem to speed up as it closes in.
 */
export function zoomTweenAt(
  from: number,
  to: number,
  elapsed: number,
  duration = DOUBLE_CLICK_ZOOM_MS,
): number {
  const t = Math.max(0, Math.min(1, elapsed / duration))
  const eased = 1 - (1 - t) ** 3
  return from * (to / from) ** eased
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
