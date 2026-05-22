import type { WorldState } from '../types'

export function normalizeLineageEras(
  raw: WorldState['lineage_eras'],
): Record<string, string> {
  if (!raw) return {}
  if (Array.isArray(raw)) {
    const out: Record<string, string> = {}
    for (const entry of raw) {
      if (entry && typeof entry === 'object' && typeof entry.lineage_id === 'string') {
        out[entry.lineage_id] = String(entry.era_name ?? 'pre-stone')
      }
    }
    return out
  }
  return raw
}
