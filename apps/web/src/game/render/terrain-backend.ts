/**
 * Which renderer draws the terrain's ground (the colour and texture of every tile).
 *
 * - `canvas` (default): the 2D base canvas paints the ground, trees, mountains and decor into one
 *   bitmap that cubeforge shows as a sprite.
 * - `tilelayer` (spike): cubeforge's GPU TileLayer draws the ground from a generated tileset and a
 *   per-tile tint; the canvas keeps only trees, mountains and decor, on a transparent background.
 *
 * Switch with `?terrain=tilelayer` (or `?terrain=canvas`) in the URL, or
 * `localStorage.setItem('humanbox.terrain', 'tilelayer')`. The URL wins. This is the one place the
 * flag is read; everything else asks `terrainBackend()`.
 */
export type TerrainBackend = 'canvas' | 'tilelayer'

export const TERRAIN_STORAGE_KEY = 'humanbox.terrain'

function parse(value: string | null | undefined): TerrainBackend | null {
  return value === 'tilelayer' || value === 'canvas' ? value : null
}

function readFlag(): TerrainBackend {
  try {
    const fromUrl = parse(new URLSearchParams(window.location.search).get('terrain'))
    if (fromUrl) return fromUrl
  } catch {
    // No window (tests, workers): fall through to the default.
  }
  try {
    const stored = parse(window.localStorage.getItem(TERRAIN_STORAGE_KEY))
    if (stored) return stored
  } catch {
    // Storage can be blocked; the default is always safe.
  }
  return 'canvas'
}

let cached: TerrainBackend | null = null

export function terrainBackend(): TerrainBackend {
  cached ??= readFlag()
  return cached
}

/** Force the backend (tests and the comparison harness). `null` re-reads the URL and storage. */
export function setTerrainBackend(next: TerrainBackend | null) {
  cached = next
}
