export const TILE_SCALE = 4
export const MAX_DEPTH = 6

export const BIOME_COLORS: [number, number, number][] = [
  [0.46, 0.58, 0.28],
  [0.18, 0.34, 0.2],
  [0.79, 0.59, 0.31],
  [0.29, 0.44, 0.34],
  [0.68, 0.69, 0.65],
  [0.27, 0.2, 0.18],
]

export const BIOME_ELEVATION: number[] = [0.0, 1.5, -0.2, -0.4, 4.0, 9.0]

export const BIOME_ROUGHNESS: number[] = [0.6, 1.2, 0.4, 0.3, 2.2, 3.2]

export const OCEAN_EXTENT = 40000

export function terrainNoise(x: number, y: number): number {
  let v = 0
  let amp = 1
  let freq = 0.07
  for (let i = 0; i < 3; i++) {
    const fx = x * freq
    const fy = y * freq
    const ix = Math.floor(fx)
    const iy = Math.floor(fy)
    const tx = fx - ix
    const ty = fy - iy
    const sx = tx * tx * (3 - 2 * tx)
    const sy = ty * ty * (3 - 2 * ty)
    const h = (a: number, b: number) => {
      const n = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453
      return (n - Math.floor(n)) * 2 - 1
    }
    const a = h(ix, iy)
    const b = h(ix + 1, iy)
    const c = h(ix, iy + 1)
    const d = h(ix + 1, iy + 1)
    const ab = a + (b - a) * sx
    const cd = c + (d - c) * sx
    v += (ab + (cd - ab) * sy) * amp
    freq *= 2.07
    amp *= 0.5
  }
  return v
}
