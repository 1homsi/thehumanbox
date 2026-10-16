/**
 * Element fullscreen is not available everywhere: iPhone Safari only allows fullscreen video, so
 * `documentElement.requestFullscreen` is undefined there and calling it throws synchronously.
 */
export function canUseFullscreen(): boolean {
  return typeof document !== 'undefined' && typeof document.documentElement.requestFullscreen === 'function'
}

/** Enter or leave fullscreen and report whether it is now on. Never throws. */
export async function toggleElementFullscreen(): Promise<boolean> {
  const el = document.documentElement
  try {
    if (!document.fullscreenElement) {
      if (typeof el.requestFullscreen !== 'function') return false
      await el.requestFullscreen()
      return true
    }
    await document.exitFullscreen()
    return false
  } catch {
    return !!document.fullscreenElement
  }
}
