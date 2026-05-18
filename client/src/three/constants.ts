export const TILE_SCALE = 4
export const MAX_DEPTH  = 6   // water now goes 6 units deep (was 3)

// Biome IDs: 0 Grassland | 1 Forest | 2 Desert | 3 Wetland | 4 Tundra | 5 Volcanic
export const BIOME_COLORS: [number, number, number][] = [
  [0.42, 0.65, 0.33], // Grassland
  [0.20, 0.45, 0.22], // Forest
  [0.82, 0.71, 0.45], // Desert
  [0.32, 0.54, 0.42], // Wetland
  [0.86, 0.88, 0.92], // Tundra
  [0.32, 0.26, 0.24], // Volcanic
]

// Real terrain shape. Each biome has a base elevation + a noise
// amplitude. Mountains rise dramatically over volcanic + tundra,
// grass rolls gently, desert is mostly flat, wetland dips slightly.
export const BIOME_ELEVATION: number[] = [
  0.0,  // Grassland
  1.5,  // Forest - elevated, canopy feels above ground
  -0.2, // Desert
  -0.4, // Wetland
  4.0,  // Tundra - foothills
  9.0,  // Volcanic - real mountains
]

// Per-biome noise amplitude (peak-to-trough). Multiplies a smoothed
// pseudo-noise function in Terrain.tsx to give each biome its own
// roughness character.
export const BIOME_ROUGHNESS: number[] = [
  0.6,  // Grassland - rolling
  1.2,  // Forest - bumpy
  0.4,  // Desert - dunes
  0.3,  // Wetland - mostly flat
  2.2,  // Tundra - hills
  3.2,  // Volcanic - mountain massifs. Was 6.0 + a 1.5× peak boost,
        // which produced Toblerone-shaped spikes because adjacent
        // vertices could differ by 8+ units. Halving the amplitude
        // and dropping the boost gives broad rolling peaks.
]

// Ocean plane extends this many world units past the actual world,
// in every direction. Large enough that the user can never see the
// edge of the ocean even while flying outside the world bounds.
export const OCEAN_EXTENT = 40000

// Multi-octave value noise. Deterministic per (x, y) so the same
// tile always gets the same height (no flicker on re-render). Cheap
// to evaluate - we call it once per vertex on terrain build, not
// per frame.
export function terrainNoise(x: number, y: number): number {
  // Three octaves of hash-based gradient noise summed at decreasing
  // amplitude. The result is in roughly [-1, 1].
  let v = 0
  let amp = 1
  let freq = 0.07
  for (let i = 0; i < 3; i++) {
    // Smoothed pseudo-random: hash the integer coords surrounding
    // (x*freq, y*freq) and bilerp between them.
    const fx = x * freq
    const fy = y * freq
    const ix = Math.floor(fx)
    const iy = Math.floor(fy)
    const tx = fx - ix
    const ty = fy - iy
    const sx = tx * tx * (3 - 2 * tx)   // smoothstep
    const sy = ty * ty * (3 - 2 * ty)
    const h = (a: number, b: number) => {
      const n = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453
      return (n - Math.floor(n)) * 2 - 1
    }
    const a = h(ix,     iy    )
    const b = h(ix + 1, iy    )
    const c = h(ix,     iy + 1)
    const d = h(ix + 1, iy + 1)
    const ab = a + (b - a) * sx
    const cd = c + (d - c) * sx
    v += (ab + (cd - ab) * sy) * amp
    freq *= 2.07
    amp  *= 0.5
  }
  return v
}
