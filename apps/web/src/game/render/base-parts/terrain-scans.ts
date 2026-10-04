import type { WorldState } from '../../../shared/types'
import { TILE_ID } from '../../model/terrain-ids'
import {
  EDGE_EAST,
  EDGE_NORTH,
  EDGE_SOUTH,
  EDGE_WEST,
  permanentWaterLandEdgeMask,
} from '../../model/terrain-visuals'
import { isRuinedBuilding } from '../../model/building-state'
import { TILE } from '../../model/palette'

// Shore-foam geometry is fully determined by the terrain grid, so it is
// baked into Path2Ds once per terrain rebuild instead of rescanning
// every tile twice per frame (that scan alone touched 360k+ tiles/frame
// on the 600x300 world).
export interface FoamPaths {
  thin: Path2D
  thick: Path2D[]
}

// Hut tiles are terrain-derived too; cache the positions per tiles array
// so the settlement-ring pass stops rescanning all 180k tiles per frame.
export let _hutSource: number[][] | null = null
export let _hutTiles: Array<[number, number]> = []
export function hutTileList(tiles: number[][]): Array<[number, number]> {
  if (tiles === _hutSource) return _hutTiles
  const out: Array<[number, number]> = []
  for (let row = 0; row < tiles.length; row++) {
    const tr = tiles[row]
    if (!tr) continue
    for (let col = 0; col < tr.length; col++) {
      if (tr[col] === TILE_ID.HUT) out.push([col, row])
    }
  }
  _hutSource = tiles
  _hutTiles = out
  return out
}

export interface HutCluster {
  cx: number
  cy: number
  count: number
}
export let _hutClusterSource: Array<[number, number]> | null = null
export let _hutClusters: HutCluster[] = []
export function cachedHutClusters(hutPositions: Array<[number, number]>): HutCluster[] {
  if (hutPositions === _hutClusterSource) return _hutClusters
  const clusters: HutCluster[] = []
  const usedInCluster = new Set<number>()
  for (let i = 0; i < hutPositions.length; i++) {
    if (usedInCluster.has(i)) continue
    const [hx, hy] = hutPositions[i]
    const cluster = [i]
    for (let j = i + 1; j < hutPositions.length; j++) {
      const [jx, jy] = hutPositions[j]
      const d2 = (hx - jx) ** 2 + (hy - jy) ** 2
      if (d2 < 64) {
        cluster.push(j)
        usedInCluster.add(j)
      }
    }
    usedInCluster.add(i)
    if (cluster.length < 3) continue
    clusters.push({
      cx: cluster.reduce((s, k) => s + hutPositions[k][0], 0) / cluster.length,
      cy: cluster.reduce((s, k) => s + hutPositions[k][1], 0) / cluster.length,
      count: cluster.length,
    })
  }
  _hutClusterSource = hutPositions
  _hutClusters = clusters
  return clusters
}

export function buildFoamPaths(tiles: number[][], width: number, height: number): FoamPaths {
  const thin = new Path2D()
  const thick = [new Path2D(), new Path2D(), new Path2D(), new Path2D()]
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const shore = permanentWaterLandEdgeMask(tiles, row, col)
      if (shore === 0) continue
      const px = col * TILE
      const py = row * TILE
      // Same hash the animated pulse used, bucketed four ways so the
      // shimmer keeps its spatial variety with four fills per frame.
      let h = (col * 374761393 + row * 668265263) | 0
      h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0
      const tp = thick[h & 3]
      if (shore & EDGE_NORTH) {
        thin.rect(px, py, TILE, 1)
        tp.rect(px, py, TILE, 2)
      }
      if (shore & EDGE_SOUTH) {
        thin.rect(px, py + TILE - 1, TILE, 1)
        tp.rect(px, py + TILE - 2, TILE, 2)
      }
      if (shore & EDGE_EAST) {
        thin.rect(px + TILE - 1, py, 1, TILE)
        tp.rect(px + TILE - 2, py, 2, TILE)
      }
      if (shore & EDGE_WEST) {
        thin.rect(px, py, 1, TILE)
        tp.rect(px, py, 2, TILE)
      }
    }
  }
  return { thin, thick }
}

export let _ruinedBuildingSource: WorldState['buildings']
export let _ruinedBuildingTiles = new Set<string>()

export function ruinedBuildingTiles(buildings: WorldState['buildings']): ReadonlySet<string> {
  if (buildings === _ruinedBuildingSource) return _ruinedBuildingTiles
  const tiles = new Set<string>()
  for (const building of buildings ?? []) {
    if (!isRuinedBuilding(building)) continue
    const footprintWidth = Math.max(1, Math.floor(building.footprint?.[0] ?? building.fw ?? 1))
    const footprintHeight = Math.max(1, Math.floor(building.footprint?.[1] ?? building.fh ?? 1))
    for (let dy = 0; dy < footprintHeight; dy++) {
      for (let dx = 0; dx < footprintWidth; dx++) {
        tiles.add(`${Math.floor(building.x + dx)},${Math.floor(building.y + dy)}`)
      }
    }
  }
  _ruinedBuildingSource = buildings
  _ruinedBuildingTiles = tiles
  return tiles
}
