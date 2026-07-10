let cached: boolean | null = null

export function webglAvailable(): boolean {
  if (cached !== null) return cached
  if (typeof document === 'undefined') return true
  try {
    const canvas = document.createElement('canvas')
    cached = !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    cached = false
  }
  return cached
}
