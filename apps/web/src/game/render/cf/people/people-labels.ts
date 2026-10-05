import type { OrganismState, PrayerInfo, VehicleInfo } from '../../../../shared/types'
import type { ViewFlags } from '../../../../state/store'
import { orgVariant } from '../../../model/org-variant'
import { drawWorkActivity, workActivity } from '../../activity-visuals'
import { compareCharacterDepth, zoomDetailLevel } from '../../character-visuals'
import { LabelPlacer, crowdLabelIds, labelWidth } from '../../crowd-detail'
import { celebrating, drawCelebrationGlyph, drawPrayingGlyph } from '../../prayer-feedback'
import type { PlacedLabel } from '../../settlement-labels'
import { isFocused } from './people-sprites'

/** What the labels need of the people layer: who is drawn where, and how they last moved. */
export interface PeopleLabelSource {
  /** The living people, in slot order. */
  orgs: readonly OrganismState[]
  /** Where each slot is drawn this frame, in map pixels (the tile centre). */
  px: ArrayLike<number>
  py: ArrayLike<number>
  /** 1 for people resting indoors, who are not drawn. */
  hidden: ArrayLike<number>
  phase: ArrayLike<number>
  step: { flipped: ArrayLike<number>; movedAt: ArrayLike<number> }
}

export interface PeopleLabelInput {
  people: PeopleLabelSource
  selectedId: string | null
  focus: string
  viewFlags: Pick<ViewFlags, 'names' | 'thoughts' | 'hideUI'>
  zoom: number
  /** Wall clock, the one `step.movedAt` is measured on. */
  now: number
  prayers: readonly PrayerInfo[] | undefined
  vehicles: readonly VehicleInfo[] | undefined
  /** Town names claim their place before people's name tags, so the two never pile on each other. */
  settlementLabels: readonly PlacedLabel[]
  /** Visible window in tiles, to skip everyone off screen. */
  window: { c0: number; c1: number; r0: number; r1: number }
  ox: number
  oy: number
}

/**
 * What a sprite cannot carry: work poses (a tool swung from the hand), prayer and celebration
 * glyphs, name tags and thoughts. Written through a recording context so the text and strokes
 * become sprites that draw above the people. Nothing is drawn for people the sprite layer does
 * not show, or when zoomed out with nobody selected.
 */
export function paintPeopleLabels(ctx: CanvasRenderingContext2D, input: PeopleLabelInput): void {
  const { people, selectedId, focus, viewFlags, zoom, now } = input
  const detail = zoomDetailLevel(zoom)
  if (detail === 'overview' && selectedId == null) return
  const { c0, c1, r0, r1 } = input.window
  const { ox, oy } = input

  // Visible, living, drawn people in the order the placer should claim space (back to front).
  const order: number[] = []
  const n = people.orgs.length
  for (let j = 0; j < n; j++) {
    const org = people.orgs[j]
    if (people.hidden[j] === 1) continue
    const lx = org.x - ox
    const ly = org.y - oy
    if (lx < c0 - 8 || lx > c1 + 8 || ly < r0 - 8 || ly > r1 + 8) continue
    order.push(j)
  }
  const visible = order.map((j) => people.orgs[j])
  const labelIds = detail !== 'overview' && viewFlags.names ? crowdLabelIds(visible, zoom) : null
  const prayerSpots = new Map((input.prayers ?? []).map((p) => [p.lineage_id, p] as const))
  const riders = new Set(
    (input.vehicles ?? []).filter((v) => v.kind === 'boat' && v.rider_id).map((v) => v.rider_id!),
  )
  const placer = new LabelPlacer()
  for (const p of input.settlementLabels) placer.place(p.cx, p.cy + p.h / 2, p.w, p.h, true)

  order.sort((a, b) => compareCharacterDepth(people.orgs[a], people.orgs[b]))
  for (const j of order) {
    const org = people.orgs[j]
    const isSelected = org.id === selectedId
    const standard = isSelected || detail !== 'overview'
    const full = isSelected || detail === 'detail'
    const px = people.px[j]
    const py = people.py[j]
    const variant = orgVariant(org.id)
    const bodyR = variant.bodyRadius * (org.sex === 'male' ? 1.05 : 0.95)
    const spriteSize = Math.round(Math.max(19, bodyR * 3.8))
    const spriteTop = py - spriteSize * 0.78
    const focused = isFocused(org, focus)
    ctx.globalAlpha = focused ? 1 : 0.12

    const movedAt = people.step.movedAt[j]
    if (standard && !riders.has(org.id)) {
      drawWorkActivity(
        ctx,
        workActivity(org.thought ?? '', now - movedAt <= 120),
        px,
        py,
        people.step.flipped[j] === 1,
        now,
        people.phase[j],
      )
    }

    const showVitals = isSelected || org.energy < 0.22 || org.hydration < 0.22 || org.health < 0.22
    const showName =
      !!org.name && (isSelected || (standard && viewFlags.names && (!labelIds || labelIds.has(org.id))))
    const showThought =
      (isSelected || (full && viewFlags.thoughts)) && org.thought && org.thought !== 'observing'
    const labelY = spriteTop - (showVitals ? 10 : 2)

    if (standard && !viewFlags.hideUI) {
      const seed = org.id.charCodeAt(0) + org.id.charCodeAt(org.id.length - 1)
      const spot = prayerSpots.get(org.lineage_id)
      if (celebrating(org.lineage_id, org.x, org.y, now)) {
        drawCelebrationGlyph(ctx, px, spriteTop, now, seed)
      } else if (spot && seed % 2 === 0 && Math.hypot(org.x - spot.x, org.y - spot.y) <= 8) {
        drawPrayingGlyph(ctx, px, spriteTop, now, seed)
      }
    }

    // Names and thoughts that would sit on top of another label are left out; the selected
    // person's always shows.
    const nameShown =
      showName && placer.place(px, labelY, labelWidth(org.name, isSelected ? 10 : 9), 10, isSelected)
    const thoughtShown =
      showThought &&
      placer.place(px, labelY - (nameShown ? 10 : 0), labelWidth(org.thought ?? '', 8), 9, isSelected)

    if (nameShown) {
      ctx.font = isSelected ? 'bold 10px monospace' : '9px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.lineWidth = 3
      ctx.strokeStyle = 'rgba(0,0,0,0.85)'
      ctx.strokeText(org.name, px, labelY)
      ctx.fillStyle = isSelected ? '#ffffff' : 'rgba(255,255,255,0.95)'
      ctx.fillText(org.name, px, labelY)
    }
    if (thoughtShown) {
      ctx.font = '8px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.lineWidth = 2.5
      ctx.strokeStyle = 'rgba(0,0,0,0.85)'
      const thoughtY = labelY - (nameShown ? 10 : 0)
      ctx.strokeText(org.thought, px, thoughtY)
      ctx.fillStyle = isSelected ? 'rgba(180,220,255,1)' : 'rgba(180,220,255,0.9)'
      ctx.fillText(org.thought, px, thoughtY)
    }
  }
  ctx.globalAlpha = 1
}
