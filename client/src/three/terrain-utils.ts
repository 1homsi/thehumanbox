import { MAX_DEPTH, BIOME_ELEVATION, BIOME_ROUGHNESS, TILE_SCALE, terrainNoise } from './constants'

// Terrain Y at a tile coordinate. Mirrors the heightfield math in
// Terrain.tsx so anything that needs to sit on (or stay above) the
// ground gets the same answer the renderer used.
//
//   d >= 254   -> land at BIOME_ELEVATION[biome]
//   d <  254   -> water at -(1 - d/200) * MAX_DEPTH
//
// Out-of-bounds: returns 0 (sea level) so callers at the world edge
// don't crash on undefined indexing.
export function heightAt(
  tileX: number,
  tileY: number,
  depthMap: number[][],
  biomes: number[][],
): number {
  const w = depthMap[0]?.length ?? 0
  const h = depthMap.length
  const ix = Math.max(0, Math.min(w - 1, Math.floor(tileX)))
  const iy = Math.max(0, Math.min(h - 1, Math.floor(tileY)))
  const d = depthMap[iy]?.[ix] ?? 255
  if (d >= 254) {
    const b = biomes[iy]?.[ix] ?? 0
    const base  = BIOME_ELEVATION[b] ?? 0
    const rough = BIOME_ROUGHNESS[b] ?? 0.5
    let h = base + terrainNoise(ix, iy) * rough
    if (b === 5 && h > 6) h += (h - 6) * 1.5
    return h
  }
  const depthFrac = Math.max(0, Math.min(1, 1 - d / 200))
  return -depthFrac * MAX_DEPTH
}

// Same as heightAt but takes world units instead of tile coords -
// the camera operates in world units, this saves the * / TILE_SCALE
// at every call site.
export function heightAtWorld(
  worldX: number,
  worldZ: number,
  depthMap: number[][],
  biomes: number[][],
): number {
  return heightAt(worldX / TILE_SCALE, worldZ / TILE_SCALE, depthMap, biomes)
}
