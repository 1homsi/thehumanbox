let cached: boolean | null = null
const failureListeners = new Set<() => void>()

/** Whether this browser can run the xipjs renderer (WebGL2). `?renderer=canvas` forces the 2D fallback. */
export function canUseWorldGPU(): boolean {
  cached ??= probe()
  return cached
}

/** The GPU renderer failed at runtime: mark it unusable and tell mounted interiors to fall back. */
export function markWorldGPUFailed(): void {
  const wasUsable = cached !== false
  cached = false
  if (wasUsable) {
    for (const listener of failureListeners) {
      try {
        listener()
      } catch {
        // one bad subscriber must not stop the others
      }
    }
  }
}

/** Subscribe to a runtime GPU failure so an interior already on screen can switch to the 2D canvas. */
export function onWorldGPUFailed(listener: () => void): () => void {
  failureListeners.add(listener)
  return () => failureListeners.delete(listener)
}

function probe(): boolean {
  try {
    if (new URLSearchParams(window.location.search).get('renderer') === 'canvas') return false
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false })
    if (!gl) return false
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    return false
  }
}

/** Force the answer (tests of the 2D fallback). `null` probes the browser again. */
export function setWorldGPUForTests(value: boolean | null): void {
  cached = value
}
