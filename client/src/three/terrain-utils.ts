import { MAX_DEPTH, BIOME_ELEVATION, BIOME_ROUGHNESS, TILE_SCALE, terrainNoise } from './constants'

// Heightfield Y at a tile-grid corner. Mirrors the per-vertex
// elevation math in Terrain.tsx exactly so anything that needs to
// sit on the ground gets the same answer the renderer used at the
// nearest mesh vertex.
function cornerHeight(
  ix: number, iy: number,
  depthMap: number[][], biomes: number[][],
): number {
  const d = depthMap[iy]?.[ix] ?? 255
  if (d >= 254) {
    const b     = biomes[iy]?.[ix] ?? 0
    const base  = BIOME_ELEVATION[b] ?? 0
    const rough = BIOME_ROUGHNESS[b] ?? 0.5
    return base + terrainNoise(ix, iy) * rough
  }
  const depthFrac = Math.max(0, Math.min(1, 1 - d / 200))
  return -depthFrac * MAX_DEPTH
}

// Terrain Y at a fractional tile coordinate. Reproduces the exact
// rendered triangle surface from Terrain.tsx so an org at (10.7, 5.3)
// lands on the slope rather than on the nearest corner alone (which
// was burying characters under the rendered triangle when their
// sampled corner happened to be the lowest of the four).
//
// Terrain.tsx triangulates each quad as:
//   tri 1: (x,y), (x,y+1), (x+1,y)           when fx + fy < 1
//   tri 2: (x+1,y), (x,y+1), (x+1,y+1)       when fx + fy >= 1
// We use barycentric interpolation against whichever triangle the
// fractional position falls into.
//
// Out-of-bounds: returns sea-level 0 so callers at the world edge
// don't crash on undefined indexing.
export function heightAt(
  tileX: number,
  tileY: number,
  depthMap: number[][],
  biomes: number[][],
): number {
  const w = depthMap[0]?.length ?? 0
  const h = depthMap.length
  if (w === 0 || h === 0) return 0
  const x0 = Math.max(0, Math.min(w - 1, Math.floor(tileX)))
  const y0 = Math.max(0, Math.min(h - 1, Math.floor(tileY)))
  const x1 = Math.min(w - 1, x0 + 1)
  const y1 = Math.min(h - 1, y0 + 1)
  const fx = Math.max(0, Math.min(1, tileX - x0))
  const fy = Math.max(0, Math.min(1, tileY - y0))

  const h00 = cornerHeight(x0, y0, depthMap, biomes)
  const h10 = cornerHeight(x1, y0, depthMap, biomes)
  const h01 = cornerHeight(x0, y1, depthMap, biomes)
  const h11 = cornerHeight(x1, y1, depthMap, biomes)

  if (fx + fy <= 1) {
    // Triangle (h00, h10, h01) with bary weights (1-fx-fy, fx, fy).
    return h00 * (1 - fx - fy) + h10 * fx + h01 * fy
  }
  // Triangle (h10, h01, h11) — rotate barycentric to that corner.
  return h10 * (1 - fy) + h01 * (1 - fx) + h11 * (fx + fy - 1)
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
