import type { WorldState } from '../../../../shared/types'
import { PERIL_HELP, remainingLine } from '../../../model/tribe-peril'
import { TILE } from '../../../model/palette'
import {
  labelScale,
  placeSettlementLabels,
  type PlacedLabel,
  type SettlementLabel,
} from '../../settlement-labels'
import { zoomDetailLevel } from '../../character-visuals'

/**
 * The town and city names `layers/buildings.ts` collects as it draws buildings, rebuilt from the
 * world alone so the HUD can place them without the building painter running (the buildings are
 * moving to xipjs in another change). Only the authoritative `settlements` list is read; the
 * legacy cluster fallback for old snapshots is left out.
 */
export function collectSettlementLabels(
  world: WorldState,
  bounds: { c0: number; c1: number; r0: number; r1: number },
  zoom: number,
): SettlementLabel[] {
  const out: SettlementLabel[] = []
  const settlements = world.settlements
  if (!settlements?.length) return out
  const ox = world.grid.origin_x ?? 0
  const oy = world.grid.origin_y ?? 0
  const MARGIN = 6
  const detail = zoomDetailLevel(zoom)
  const lineageNames = world.lineage_names ?? {}
  const perilBy = new Map((world.tribes_in_peril ?? []).map((p) => [p.lineage_id, p]))
  for (const s of settlements) {
    const [cx, cy] = s.center
    if (cx - ox < bounds.c0 - MARGIN || cx - ox > bounds.c1 + MARGIN) continue
    if (cy - oy < bounds.r0 - MARGIN || cy - oy > bounds.r1 + MARGIN) continue
    const major = (s.tier ?? 0) >= 5
    const peril = perilBy.get(s.lineage_id)
    const show = s.tier !== 0 && (detail !== 'overview' || major)
    if (!show && !peril) continue
    const name = s.name ?? lineageNames[s.lineage_id] ?? s.lineage_id.slice(0, 6)
    const title = s.tier >= 5 ? `${name.toUpperCase()} CITY` : `${name} ${s.tier_name ?? 'settlement'}`
    out.push({
      x: (cx - ox) * TILE,
      y: (cy - oy) * TILE,
      title,
      sub: peril
        ? `⚠ ${remainingLine(peril.population)} · ${PERIL_HELP[peril.cause].reason}`
        : `${s.population} people · ${s.building_count} buildings`,
      major,
      priority: (peril ? 1_000_000 : 0) + s.tier * 10000 + s.population,
      color: major ? '#ffd28a' : s.tier >= 4 || s.building_count >= 8 ? '#e5c89a' : '#c8b890',
      alert: !!peril,
    })
  }
  return out
}

/** Place the labels for the current camera (same call the building painter made). */
export function placeLabels(
  labels: readonly SettlementLabel[],
  zoom: number,
  measure: (text: string, kind: 'major' | 'minor' | 'sub') => number,
  W: number,
  H: number,
): PlacedLabel[] {
  if (labels.length === 0) return []
  return placeSettlementLabels(labels, labelScale(zoom), measure, { w: W, h: H }, TILE * 2)
}
