let cached: boolean | null = null

/** Whether this browser can run the cubeforge renderer (WebGL2). `?renderer=canvas` forces the 2D fallback. */
export function canUseWorldGPU(): boolean {
  cached ??= probe()
  return cached
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
