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
  previous?: RenderWindow,
): RenderWindow {
  const zoom = Number.isFinite(camera.zoom) && camera.zoom > 0 ? camera.zoom : 1
  const chunk = 128
  const halfW = viewport.w / (2 * zoom)
  const halfH = viewport.h / (2 * zoom)
  const width = Math.min(worldWidth, Math.ceil((halfW * 2) / chunk) * chunk + chunk * 2)
  const height = Math.min(worldHeight, Math.ceil((halfH * 2) / chunk) * chunk + chunk * 2)
  // Keep the texture while its padded contents cover the visible map. Recenter
  // only near an edge; ordinary camera movement is just a GPU transform.
  if (
    previous &&
    previous.width * previous.height <= width * height * 4 &&
    previous.x <= Math.max(0, camera.x - halfW - 32) &&
    previous.y <= Math.max(0, camera.y - halfH - 32) &&
    previous.x + previous.width >= Math.min(worldWidth, camera.x + halfW + 32) &&
    previous.y + previous.height >= Math.min(worldHeight, camera.y + halfH + 32)
  )
    return previous
  const x = Math.max(0, Math.min(worldWidth - width, Math.floor((camera.x - width / 2) / chunk) * chunk))
  const y = Math.max(0, Math.min(worldHeight - height, Math.floor((camera.y - height / 2) / chunk) * chunk))
  return { x, y, width: Math.max(1, width), height: Math.max(1, height) }
}
