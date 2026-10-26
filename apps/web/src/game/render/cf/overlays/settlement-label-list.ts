import type { WorldState } from '../../../../shared/types'
import { t } from '../../../../i18n'
import { PERIL_HELP, remainingLine } from '../../../model/tribe-peril'
import type { LabelPresence } from '../../label-presence'
import { TILE } from '../../../model/palette'
import {
  labelScale,
  placeSettlementLabels,
  type LabelKind,
  type PlacedLabel,
  type SettlementLabel,
} from '../../settlement-labels'

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
  const lineageNames = world.lineage_names ?? {}
  const perilBy = new Map((world.tribes_in_peril ?? []).map((p) => [p.lineage_id, p]))
  for (const s of settlements) {
    const [cx, cy] = s.center
    if (cx - ox < bounds.c0 - MARGIN || cx - ox > bounds.c1 + MARGIN) continue
    if (cy - oy < bounds.r0 - MARGIN || cy - oy > bounds.r1 + MARGIN) continue
    const rank = s.tier ?? 0
    const major = rank >= 5
    const peril = perilBy.get(s.lineage_id)
    const show = rank !== 0
    const fade = major ? 1 : Math.max(0, Math.min(1, (zoom - 0.68) / 0.16))
    if ((!show || fade === 0) && !peril) continue
    const name = s.name ?? lineageNames[s.lineage_id] ?? s.lineage_id.slice(0, 6)
    const title = name.toUpperCase()
    out.push({
      key: s.lineage_id,
      x: (cx - ox) * TILE,
      y: (cy - oy) * TILE,
      title,
      // Zoomed out to the world, the warning keeps to how many are left; the reason waits for a closer look.
      sub: peril
        ? zoom < 0.68
          ? `⚠ ${remainingLine(peril.population)}`
          : `⚠ ${remainingLine(peril.population)} · ${t(PERIL_HELP[peril.cause].reason)}`
        : '',
      major,
      rank,
      alpha: peril ? 1 : fade,
      priority: (peril ? 1_000_000 : 0) + rank * 10000 + s.population,
      alert: !!peril,
    })
  }
  return out
}

/** Place the labels for the current camera (same call the building painter made). */
export function placeLabels(
  labels: readonly SettlementLabel[],
  zoom: number,
  measure: (text: string, kind: LabelKind) => number,
  W: number,
  H: number,
  held?: ReadonlyMap<string, number>,
): PlacedLabel[] {
  if (labels.length === 0) return []
  return placeSettlementLabels(labels, labelScale(zoom), measure, { w: W, h: H }, TILE * 2, held)
}

/** The place each settlement's lettering is showing at, for the ones still visible, so placement can keep them there. */
export function heldSettlementSlots(
  fade: LabelPresence<PlacedLabel>,
  labels: readonly SettlementLabel[],
): Map<string, number> {
  const held = new Map<string, number>()
  for (const label of labels) {
    const key = label.key ?? label.title
    const data = fade.dataOf(key)
    if (data && fade.visible(key) && data.slot !== undefined) held.set(key, data.slot)
  }
  return held
}

/**
 * The lettering to draw this paint. A settlement's lettering fades in as it is placed, and one that was showing and is
 * not placed any more (it left the view, or lost its place) fades out where it was. Without this a name would pop on
 * when it is first placed and off when it is not.
 */
export function fadeSettlementLabels(
  fade: LabelPresence<PlacedLabel>,
  now: number,
  labels: readonly SettlementLabel[],
  placed: readonly PlacedLabel[],
): PlacedLabel[] {
  fade.begin(now)
  const byKey = new Map(placed.map((p) => [p.key ?? p.title, p] as const))
  const out: PlacedLabel[] = []
  for (const label of labels) {
    const key = label.key ?? label.title
    const p = byKey.get(key)
    const opacity = fade.set(key, p !== undefined, p)
    // A settlement that lost its place still fades out where it was last drawn, so draw it from the data it was held with.
    if (opacity > 0) {
      const shown = p ?? fade.dataOf(key)
      if (shown) out.push({ ...shown, alpha: shown.alpha * opacity })
    }
  }
  fade.leaving((_key, held, opacity) => {
    out.push({ ...held, alpha: held.alpha * opacity })
  })
  return out
}
