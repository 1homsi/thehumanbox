import { FOOTPRINTS } from './footprint-table'
import type { BuildingLike } from './types'

// Building kinds are a small closed set, but the lookup helpers below run for every
// building on every frame (and several times inside the depth sort), so the regex
// rewrite and the footprint fallback are computed once per distinct kind.
const normKindCache = new Map<string, string>()
const NORM_KIND_CACHE_MAX = 2048

export function normKind(kind: string): string {
  const cached = normKindCache.get(kind)
  if (cached !== undefined) return cached
  const normalized = kind
    .toLowerCase()
    .replace(/_([a-z])/g, (_, c) => c.toUpperCase())
    .replace(/^([a-z])/, (_, c) => c.toUpperCase())
  if (normKindCache.size >= NORM_KIND_CACHE_MAX) normKindCache.clear()
  normKindCache.set(kind, normalized)
  return normalized
}

const DEFAULT_FOOTPRINT: [number, number] = [1, 1]
const footprintCache = new Map<string, [number, number]>()

export function buildingFootprint(kind: string): [number, number] {
  const cached = footprintCache.get(kind)
  if (cached !== undefined) return cached
  const found = FOOTPRINTS[kind] ?? FOOTPRINTS[normKind(kind)] ?? DEFAULT_FOOTPRINT
  if (footprintCache.size >= NORM_KIND_CACHE_MAX) footprintCache.clear()
  footprintCache.set(kind, found)
  return found
}

function positiveTileSpan(value: number | undefined, fallback: number): number {
  const resolved = Number.isFinite(value) ? (value as number) : fallback
  return Math.max(1, Math.floor(resolved))
}

/**
 * Uses the footprint supplied by the simulation whenever possible. The local
 * kind table only exists for legacy snapshots that predate serialized sizes.
 */
export function resolveBuildingFootprint(
  building: Pick<BuildingLike, 'kind' | 'footprint' | 'fw' | 'fh'>,
): [number, number] {
  const fallback = buildingFootprint(building.kind)
  if (building.footprint) {
    return [
      positiveTileSpan(building.footprint[0], fallback[0]),
      positiveTileSpan(building.footprint[1], fallback[1]),
    ]
  }
  if (building.fw !== undefined || building.fh !== undefined) {
    return [positiveTileSpan(building.fw, fallback[0]), positiveTileSpan(building.fh, fallback[1])]
  }
  return [positiveTileSpan(fallback[0], 1), positiveTileSpan(fallback[1], 1)]
}
