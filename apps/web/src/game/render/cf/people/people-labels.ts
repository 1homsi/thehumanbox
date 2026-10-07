import type { OrganismState, PrayerInfo, VehicleInfo } from '../../../../shared/types'
import type { ViewFlags } from '../../../../state/store'
import { orgVariant } from '../../../model/org-variant'
import { drawWorkActivity, workActivity } from '../../activity-visuals'
import { compareCharacterDepth, zoomDetailLevel } from '../../character-visuals'
import { LabelPlacer, crowdLabelIdsAt, labelWidth } from '../../crowd-detail'
import {
  celebrating,
  drawCelebrationGlyph,
  drawPrayingGlyph,
  prayerEffectsActive,
} from '../../prayer-feedback'
import type { PlacedLabel } from '../../settlement-labels'
import { isFocused } from './people-sprites'
import { emitWorkPose, isFastPose, type PoseSink } from './work-poses'

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
  /**
   * What the people layer worked out about each slot when it rebuilt (`LABEL_*` bits), so a frame need not open
   * every person to learn they have no name, no thought and no work. Optional: without it the painter reads
   * the people themselves.
   */
  labelFlags?: ArrayLike<number>
  /** `org.x` and `org.y` of each slot, in tiles (what the window test and the crowd thinning read). */
  tileX?: ArrayLike<number>
  tileY?: ArrayLike<number>
  /** The id of each slot. */
  ids?: ArrayLike<string>
}

/** Facts about a person that only change with a simulation frame (see `PeopleLabelSource.labelFlags`). */
export const LABEL_NAME = 1
export const LABEL_THOUGHT = 2
export const LABEL_ACTIVITY = 4
export const LABEL_SEED_EVEN = 8

export function labelFlagsOf(org: OrganismState): number {
  const thought = org.thought ?? ''
  let f = 0
  if (org.name) f |= LABEL_NAME
  if (org.thought && org.thought !== 'observing') f |= LABEL_THOUGHT
  if (workActivity(thought, false)) f |= LABEL_ACTIVITY
  if (prayerSeed(org.id) % 2 === 0) f |= LABEL_SEED_EVEN
  return f
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
  /**
   * Where work poses may be written as sprites directly, skipping the canvas calls. Without it every pose goes
   * through `ctx` (what the tests compare against).
   */
  poses?: PoseSink
}

/** What a person has to draw above their sprite this frame (a bit mask). */
const WORK = 1
const GLYPH_CELEBRATE = 2
const GLYPH_PRAY = 4
const NAME = 8
const THOUGHT = 16

/** Scratch space reused between frames: the painter runs up to 30 times a second over a crowd. */
let onScreenScratch = new Int32Array(0)
let flagsScratch = new Uint8Array(0)
const candidates: number[] = []

/** A person's prayer glyph seed: whether they join in, and where in the dance they start. */
export function prayerSeed(id: string): number {
  return id.charCodeAt(0) + id.charCodeAt(id.length - 1)
}

/**
 * What a sprite cannot carry: work poses (a tool swung from the hand), prayer and celebration
 * glyphs, name tags and thoughts. Written through a recording context so the text and strokes
 * become sprites that draw above the people. Nothing is drawn for people the sprite layer does
 * not show, or when zoomed out with nobody selected.
 *
 * A first pass over everyone on screen only decides who has anything to draw (a handful, even in
 * a crowd of thousands); the depth sort and the drawing then run over those people alone.
 */
export function paintPeopleLabels(ctx: CanvasRenderingContext2D, input: PeopleLabelInput): void {
  const { people, selectedId, focus, viewFlags, zoom, now } = input
  const detail = zoomDetailLevel(zoom)
  if (detail === 'overview' && selectedId == null) return
  const { c0, c1, r0, r1 } = input.window
  const { ox, oy, poses } = input
  const orgs = people.orgs
  const n = orgs.length
  if (onScreenScratch.length < n) {
    onScreenScratch = new Int32Array(Math.max(n, onScreenScratch.length * 2, 256))
    flagsScratch = new Uint8Array(onScreenScratch.length)
  }
  const onScreen = onScreenScratch
  const flags = flagsScratch
  const { tileX, tileY, ids } = people

  // Visible, living, drawn people.
  let count = 0
  for (let j = 0; j < n; j++) {
    if (people.hidden[j] === 1) continue
    const lx = (tileX ? tileX[j] : orgs[j].x) - ox
    const ly = (tileY ? tileY[j] : orgs[j].y) - oy
    if (lx < c0 - 8 || lx > c1 + 8 || ly < r0 - 8 || ly > r1 + 8) continue
    onScreen[count++] = j
  }
  const labelIds =
    detail !== 'overview' && viewFlags.names
      ? crowdLabelIdsAt(orgs, onScreen, count, zoom, tileX, tileY, ids)
      : null
  const effects = prayerEffectsActive()
  let prayerSpots: Map<string, PrayerInfo> | null = null
  if (input.prayers && input.prayers.length > 0) {
    prayerSpots = new Map()
    for (const p of input.prayers) prayerSpots.set(p.lineage_id, p)
  }
  let riders: Set<string> | null = null
  if (input.vehicles) {
    for (const v of input.vehicles) {
      if (v.kind === 'boat' && v.rider_id) (riders ??= new Set()).add(v.rider_id)
    }
  }

  // Who has something to draw, and what. The per-slot facts come from the people layer when it has them,
  // so a person with nothing to show costs a few typed-array reads and no visit to the person.
  const hideUI = viewFlags.hideUI
  const pre = people.labelFlags
  const movedAt = people.step.movedAt
  candidates.length = 0
  for (let k = 0; k < count; k++) {
    const j = onScreen[k]
    const f = pre ? pre[j] : labelFlagsOf(orgs[j])
    const id = ids ? ids[j] : orgs[j].id
    const isSelected = id === selectedId
    const standard = isSelected || detail !== 'overview'
    const full = isSelected || detail === 'detail'
    let mask = 0
    if (standard && f & LABEL_ACTIVITY && !(now - movedAt[j] <= 120) && !riders?.has(id)) mask |= WORK
    if (standard && !hideUI) {
      if (effects || (prayerSpots && f & LABEL_SEED_EVEN)) {
        const org = orgs[j]
        if (celebrating(org.lineage_id, org.x, org.y, now)) mask |= GLYPH_CELEBRATE
        else if (prayerSpots && f & LABEL_SEED_EVEN) {
          const spot = prayerSpots.get(org.lineage_id)
          if (spot && Math.hypot(org.x - spot.x, org.y - spot.y) <= 8) mask |= GLYPH_PRAY
        }
      }
    }
    if (f & LABEL_NAME && (isSelected || (standard && viewFlags.names && (!labelIds || labelIds.has(id)))))
      mask |= NAME
    if (f & LABEL_THOUGHT && (isSelected || (full && viewFlags.thoughts))) mask |= THOUGHT
    flags[j] = mask
    if (mask !== 0) candidates.push(j)
  }
  if (candidates.length === 0) {
    ctx.globalAlpha = 1
    return
  }

  const placer = new LabelPlacer()
  for (const p of input.settlementLabels) placer.place(p.cx, p.cy + p.h / 2, p.w, p.h, true)

  // Back to front, the order the placer should claim space in.
  candidates.sort((a, b) => compareCharacterDepth(orgs[a], orgs[b]))
  for (const j of candidates) {
    const org = orgs[j]
    const mask = flags[j]
    const alpha = isFocused(org, focus) ? 1 : 0.12

    if (mask & WORK) {
      const activity = workActivity(org.thought ?? '', now - people.step.movedAt[j] <= 120)
      if (poses && isFastPose(activity))
        emitWorkPose(
          poses,
          activity,
          people.px[j],
          people.py[j],
          people.step.flipped[j] === 1,
          now,
          people.phase[j],
          alpha,
        )
      else {
        ctx.globalAlpha = alpha
        drawWorkActivity(
          ctx,
          activity,
          people.px[j],
          people.py[j],
          people.step.flipped[j] === 1,
          now,
          people.phase[j],
        )
      }
      // A person with only a pose to draw has nothing to place.
      if (mask === WORK) continue
    }

    ctx.globalAlpha = alpha
    const isSelected = org.id === selectedId
    const px = people.px[j]
    const py = people.py[j]
    const variant = orgVariant(org.id)
    const bodyR = variant.bodyRadius * (org.sex === 'male' ? 1.05 : 0.95)
    const spriteSize = Math.round(Math.max(19, bodyR * 3.8))
    const spriteTop = py - spriteSize * 0.78

    const showVitals = isSelected || org.energy < 0.22 || org.hydration < 0.22 || org.health < 0.22
    const labelY = spriteTop - (showVitals ? 10 : 2)

    if (mask & GLYPH_CELEBRATE) drawCelebrationGlyph(ctx, px, spriteTop, now, prayerSeed(org.id))
    else if (mask & GLYPH_PRAY) drawPrayingGlyph(ctx, px, spriteTop, now, prayerSeed(org.id))

    // Names and thoughts that would sit on top of another label are left out; the selected
    // person's always shows.
    const nameShown =
      (mask & NAME) !== 0 &&
      placer.place(px, labelY, labelWidth(org.name, isSelected ? 10 : 9), 10, isSelected)
    const thoughtShown =
      (mask & THOUGHT) !== 0 &&
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
