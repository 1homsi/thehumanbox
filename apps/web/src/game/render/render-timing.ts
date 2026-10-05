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

/**
 * Whether the simulation has gone quiet: no frame has arrived for longer than one interval and a
 * bit, so everything interpolating between frames has arrived and a paused map can stop redrawing.
 */
export function isSettled(
  interp: {
    currentReceivedAt: { current: number }
    currentServerAt: { current: number }
    prevServerAt: { current: number }
  },
  now: number,
): boolean {
  const interval = Math.max(50, interp.currentServerAt.current - interp.prevServerAt.current)
  return now - interp.currentReceivedAt.current > interval + 160
}
