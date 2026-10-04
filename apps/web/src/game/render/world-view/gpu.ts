export function canUseWorldGPU(): boolean {
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
