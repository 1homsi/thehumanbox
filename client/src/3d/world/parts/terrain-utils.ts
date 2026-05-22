import { MAX_DEPTH, BIOME_ELEVATION, BIOME_ROUGHNESS, TILE_SCALE, terrainNoise } from './constants'

function cornerHeight(ix: number, iy: number, depthMap: number[][], biomes: number[][]): number {
  const d = depthMap[iy]?.[ix] ?? 255
  if (d >= 254) {
    const b = biomes[iy]?.[ix] ?? 0
    const base = BIOME_ELEVATION[b] ?? 0
    const rough = BIOME_ROUGHNESS[b] ?? 0.5
    return base + terrainNoise(ix, iy) * rough
  }
  const depthFrac = Math.max(0, Math.min(1, 1 - d / 200))
  return -depthFrac * MAX_DEPTH
}

export function heightAt(tileX: number, tileY: number, depthMap: number[][], biomes: number[][]): number {
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
    return h00 * (1 - fx - fy) + h10 * fx + h01 * fy
  }
  return h10 * (1 - fy) + h01 * (1 - fx) + h11 * (fx + fy - 1)
}

export function heightAtWorld(
  worldX: number,
  worldZ: number,
  depthMap: number[][],
  biomes: number[][],
): number {
  return heightAt(worldX / TILE_SCALE, worldZ / TILE_SCALE, depthMap, biomes)
}
