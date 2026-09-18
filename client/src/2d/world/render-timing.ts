export function worldRenderScale(zoom: number, dpr: number, lowPerf: boolean): number {
  if (!Number.isFinite(zoom) || zoom <= 0) return 1
  const density = Math.min(lowPerf ? 1 : 2, Math.max(1, dpr || 1))
  return Math.min(1, Math.max(lowPerf ? 0.125 : 0.25, Math.ceil(zoom * density * 8) / 8))
}

export function interpolationFactor(now: number, receivedAt: number, interval: number): number {
  return Math.max(0, Math.min(1, (now - receivedAt) / Math.max(50, interval)))
}

export function shouldRenderFrame(now: number, previous: number, fps: number): boolean {
  return now - previous >= 1000 / fps - 0.5
}

export interface RenderWindow {
  x: number
  y: number
  width: number
  height: number
}

/** A padded, tile-aligned texture window. Camera motion within a chunk reuses
 * the same bitmap; zooming in never allocates a full-world GPU texture. */
export function worldRenderWindow(
  worldWidth: number,
  worldHeight: number,
  camera: { x: number; y: number; zoom: number },
  viewport: { w: number; h: number },
): RenderWindow {
  const zoom = Number.isFinite(camera.zoom) && camera.zoom > 0 ? camera.zoom : 1
  const chunk = 128
  const left = Math.max(0, Math.floor((camera.x - viewport.w / (2 * zoom)) / chunk) * chunk - chunk)
  const top = Math.max(0, Math.floor((camera.y - viewport.h / (2 * zoom)) / chunk) * chunk - chunk)
  const right = Math.min(worldWidth, Math.ceil((camera.x + viewport.w / (2 * zoom)) / chunk) * chunk + chunk)
  const bottom = Math.min(
    worldHeight,
    Math.ceil((camera.y + viewport.h / (2 * zoom)) / chunk) * chunk + chunk,
  )
  // A camera outside the world still needs a valid texture while it is clamped.
  const x = Math.min(left, Math.max(0, worldWidth - chunk))
  const y = Math.min(top, Math.max(0, worldHeight - chunk))
  return { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) }
}
