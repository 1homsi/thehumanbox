import type { WorldState } from '../../../shared/types'
import { TILE_ID } from '../../model/terrain-ids'
import { isRuinedBuilding } from '../../model/building-state'

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
