import { resolveBuildingFootprint } from './footprints'
import type { BuildingLike } from './types'

/** Bottom edge used for painter-style depth sorting. */
export function buildingDepthKey(building: BuildingLike): number {
  const [, height] = resolveBuildingFootprint(building)
  return (Number.isFinite(building.y) ? building.y : 0) + height
}

/** Stable bottom-edge ordering for buildings that share a depth row. */
export function compareBuildingsByDepth(a: BuildingLike, b: BuildingLike): number {
  return (
    buildingDepthKey(a) - buildingDepthKey(b) ||
    (Number.isFinite(a.x) ? a.x : 0) - (Number.isFinite(b.x) ? b.x : 0) ||
    a.id - b.id
  )
}

/**
 * Sorts a copy of `buildings` into the same order as
 * `[...buildings].sort(compareBuildingsByDepth)`, but resolves each building's
 * depth key once instead of twice per comparison.
 */
export function sortBuildingsByDepth<T extends BuildingLike>(buildings: readonly T[]): T[] {
  const n = buildings.length
  const depth = new Float64Array(n)
  const left = new Float64Array(n)
  const order = new Array<number>(n)
  for (let i = 0; i < n; i++) {
    const b = buildings[i]
    depth[i] = buildingDepthKey(b)
    left[i] = Number.isFinite(b.x) ? b.x : 0
    order[i] = i
  }
  order.sort((i, j) => depth[i] - depth[j] || left[i] - left[j] || buildings[i].id - buildings[j].id)
  const out = new Array<T>(n)
  for (let i = 0; i < n; i++) out[i] = buildings[order[i]]
  return out
}
