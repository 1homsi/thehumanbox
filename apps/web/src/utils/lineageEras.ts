import type { WorldState } from '../types'

const ARRAY_CACHE = new WeakMap<object, Record<string, string>>()
const EMPTY_ERAS: Record<string, string> = {}

export function normalizeLineageEras(raw: WorldState['lineage_eras']): Record<string, string> {
  if (!raw) return EMPTY_ERAS
  if (Array.isArray(raw)) {
    const cached = ARRAY_CACHE.get(raw)
    if (cached) return cached
    const out: Record<string, string> = {}
    for (const entry of raw) {
      if (entry && typeof entry === 'object' && typeof entry.lineage_id === 'string') {
        out[entry.lineage_id] = String(entry.era_name ?? 'pre-stone')
      }
    }
    ARRAY_CACHE.set(raw, out)
    return out
  }
  return raw
}
