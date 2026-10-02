import type { TribePeril } from '../types'

/**
 * The tribes newly on the brink since the last look. `seen` is updated to
 * the tribes now in peril, so one that stays there is announced once and one
 * that recovers and falls again is announced again.
 */
export function newPerils(seen: Set<string>, perils: readonly TribePeril[] | undefined): TribePeril[] {
  const now = new Set((perils ?? []).map((p) => p.lineage_id))
  const fresh = (perils ?? []).filter((p) => !seen.has(p.lineage_id))
  seen.clear()
  for (const id of now) seen.add(id)
  return fresh
}
