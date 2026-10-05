// The people-label painter as it was before it was made cheap (string-keyed placer, every person
// visited, every person sorted). The tests run it against the real one and require identical drawing.
import { orgVariant } from '../../../model/org-variant'
import { drawWorkActivity, workActivity } from '../../activity-visuals'
import { compareCharacterDepth, zoomDetailLevel } from '../../character-visuals'
import { celebrating, drawCelebrationGlyph, drawPrayingGlyph } from '../../prayer-feedback'
import { isFocused } from './people-sprites'
import type { PeopleLabelInput } from './people-labels'

/** Bound unreadable overlapping labels while retaining every person's sprite. */
export function referenceCrowdLabelIds(
  people: readonly { id: string; x: number; y: number }[],
  zoom: number,
): Set<string> | null {
  if (people.length <= 400) return null
  const cells = new Map<string, string>()
  const scale = Math.max(0.1, zoom) * 8
  for (const person of people) {
    const key = `${Math.floor((person.x * scale) / 80)},${Math.floor((person.y * scale) / 22)}`
    const previous = cells.get(key)
    if (previous === undefined || person.id < previous) cells.set(key, person.id)
  }
  return new Set(cells.values())
}

/**
 * Greedy label placement: each label claims a box, and one that would
 * overlap a box already claimed is skipped. Boxes are bucketed in a coarse
 * grid so a crowd of hundreds stays cheap.
 */
export class ReferenceLabelPlacer {
  private cells = new Map<string, [number, number, number, number][]>()
  private readonly cell: number
  constructor(cell = 48) {
    this.cell = cell
  }

  private keys(x0: number, y0: number, x1: number, y1: number): string[] {
    const out: string[] = []
    for (let cx = Math.floor(x0 / this.cell); cx <= Math.floor(x1 / this.cell); cx++)
      for (let cy = Math.floor(y0 / this.cell); cy <= Math.floor(y1 / this.cell); cy++)
        out.push(`${cx},${cy}`)
    return out
  }

  /** Claim a box centred on `x` with its bottom at `y`; false if it would overlap. */
  place(x: number, y: number, w: number, h: number, force = false): boolean {
    const box: [number, number, number, number] = [x - w / 2, y - h, x + w / 2, y]
    const keys = this.keys(box[0], box[1], box[2], box[3])
    if (!force) {
      for (const key of keys) {
        for (const b of this.cells.get(key) ?? []) {
          if (box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1]) return false
        }
      }
    }
    for (const key of keys) {
      const list = this.cells.get(key)
      if (list) list.push(box)
      else this.cells.set(key, [box])
    }
    return true
  }
}

/** Approximate width of a monospace label, so placement needs no measuring. */
export function labelWidth(text: string, px: number): number {
  return text.length * px * 0.6 + 4
}

/**
 * What a sprite cannot carry: work poses (a tool swung from the hand), prayer and celebration
 * glyphs, name tags and thoughts. Written through a recording context so the text and strokes
 * become sprites that draw above the people. Nothing is drawn for people the sprite layer does
 * not show, or when zoomed out with nobody selected.
 */
export function paintPeopleLabelsReference(ctx: CanvasRenderingContext2D, input: PeopleLabelInput): void {
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
  const labelIds = detail !== 'overview' && viewFlags.names ? referenceCrowdLabelIds(visible, zoom) : null
  const prayerSpots = new Map((input.prayers ?? []).map((p) => [p.lineage_id, p] as const))
  const riders = new Set(
    (input.vehicles ?? []).filter((v) => v.kind === 'boat' && v.rider_id).map((v) => v.rider_id!),
  )
  const placer = new ReferenceLabelPlacer()
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
