// World scale: 1 tile = 4 world units. Free-fly at 30 u/s means
// corner-to-corner (600 tiles = 2400 units) is ~80s base / 20s
// boosted. Feels like a real journey, not a teleport.
export const TILE_SCALE = 4

// Water depth visualization. depth_map values: 255 = land (y=0),
// 0 = deepest ocean. Mapped to a negative y up to -MAX_DEPTH units.
export const MAX_DEPTH = 3

// Biome IDs from simulation/world/tiles.rs:
//   0 Grassland | 1 Forest | 2 Desert | 3 Wetland | 4 Tundra | 5 Volcanic
// Vertex colors in linear-space RGB. drei's Sky is gamma-corrected so
// colors render close to these picked values under normal sun.
export const BIOME_COLORS: [number, number, number][] = [
  [0.39, 0.61, 0.31], // Grassland - medium green
  [0.18, 0.42, 0.20], // Forest    - dark green
  [0.78, 0.68, 0.42], // Desert    - sand yellow
  [0.30, 0.51, 0.40], // Wetland   - greenish-teal
  [0.84, 0.86, 0.90], // Tundra    - off-white
  [0.31, 0.24, 0.22], // Volcanic  - dark rock
]

// Small per-biome land elevation so the terrain isn't a flat sheet.
// Phase 4 will add noise-based variation; for now a constant per
// biome reads as gentle landscape variation.
export const BIOME_ELEVATION: number[] = [
  0.0,  // Grassland
  0.4,  // Forest (slightly raised, suggests canopy floor)
  -0.1, // Desert (slight dip)
  -0.2, // Wetland (lowland)
  0.6,  // Tundra (foothills)
  1.2,  // Volcanic (peaks)
]
