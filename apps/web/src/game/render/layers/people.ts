import { personName } from '../../../shared/personName'
import { _orgLastPos, orgMotion } from '.././draw-helpers'
import { drawBoat } from '.././boat-sprite'
import { crowdLabelIds, LabelPlacer, labelWidth } from '.././crowd-detail'
import type { OrganismState } from '../../../shared/types'

import { drawPeopleTile, getPeopleAtlas, pickHumanSprite } from '../../../shared/sprites'

import {
  deterministicAppearanceIndex,
  resolveAgeStage,
  zoomDetailLevel,
  characterFrame,
  compareCharacterDepth,
} from '.././character-visuals'
import { TILE } from '../../model/palette'
import { orgVariant } from '../../model/org-variant'
import { isFocused } from '../cf/people/people-sprites'

import type { DrawFrame } from './frame'

/**
 * The population in the 2D fallback: shadow, sprite, boat, a ring under the selected person,
 * vitals and name tags. (On cubeforge the people are sprite layers with far more detail.)
 */
export function draw_people(f: DrawFrame) {
  const { ctx, world, selectedOrgId, focus, viewFlags, cameraZoom, ox, oy, r0, r1, c0, c1, organisms, t } = f
  const characterDetail = zoomDetailLevel(cameraZoom)
  if (characterDetail === 'overview' && selectedOrgId == null) return

  const visible = organisms.filter(
    (org) =>
      org.alive &&
      org.x - ox >= c0 - 8 &&
      org.x - ox <= c1 + 8 &&
      org.y - oy >= r0 - 8 &&
      org.y - oy <= r1 + 8,
  )
  const boatsByRider = new Map(
    (world.vehicles ?? []).filter((v) => v.kind === 'boat' && v.rider_id).map((v) => [v.rider_id!, v]),
  )
  const labelIds =
    characterDetail !== 'overview' && viewFlags.names ? crowdLabelIds(visible, cameraZoom) : null
  if (_orgLastPos.size > Math.max(512, visible.length * 3)) {
    const ids = new Set(visible.map((organism) => organism.id))
    for (const id of _orgLastPos.keys()) if (!ids.has(id)) _orgLastPos.delete(id)
  }
  for (const boat of world.vehicles ?? []) {
    if (boat.kind !== 'boat' || boat.rider_id) continue
    if (boat.x - ox < c0 - 3 || boat.x - ox > c1 + 3 || boat.y - oy < r0 - 3 || boat.y - oy > r1 + 3) continue
    drawBoat(ctx, (boat.x - ox) * TILE + TILE / 2, (boat.y - oy) * TILE + TILE / 2, t, false)
  }
  for (const org of visible) orgMotion(org.id, org.x, org.y, t)

  const placer = new LabelPlacer()
  const peopleAtlas = getPeopleAtlas()
  const smoothing = ctx.imageSmoothingEnabled
  ctx.imageSmoothingEnabled = false
  for (const org of visible.sort(compareCharacterDepth)) {
    const px = (org.x - ox) * TILE + TILE / 2
    const py = (org.y - oy) * TILE + TILE / 2
    const isSelected = org.id === selectedOrgId
    const variant = orgVariant(org.id)
    const bodyR = variant.bodyRadius * (org.sex === 'male' ? 1.05 : 0.95)
    const spriteSize = Math.round(Math.max(19, bodyR * 3.8))
    const spriteTop = py - spriteSize * 0.78
    ctx.globalAlpha = isFocused(org, focus) ? 1 : 0.12

    if (characterDetail !== 'overview') {
      ctx.fillStyle = 'rgba(0,0,0,0.4)'
      ctx.beginPath()
      ctx.ellipse(px + 1, py + spriteSize * 0.2, spriteSize * 0.27, spriteSize * 0.1, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    if (isSelected) {
      ctx.strokeStyle = 'rgba(255,255,255,0.95)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.ellipse(px, py + 2, spriteSize * 0.42, spriteSize * 0.24, 0, 0, Math.PI * 2)
      ctx.stroke()
    }

    const motion = _orgLastPos.get(org.id)!
    const boat = boatsByRider.get(org.id)
    const sprite = pickHumanSprite(
      org.sex === 'female' ? 'female' : 'male',
      resolveAgeStage(org),
      boat ? 0 : characterFrame(motion, t),
      deterministicAppearanceIndex(org.id),
    )
    const drew = drawPeopleTile(
      ctx,
      sprite,
      Math.round(px - spriteSize / 2),
      Math.round(spriteTop),
      spriteSize,
      motion.flipped,
      peopleAtlas,
    )
    if (!drew) {
      ctx.fillStyle = variant.hairColor
      ctx.beginPath()
      ctx.arc(px, py - bodyR * 0.7, bodyR * 0.55, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = variant.accent
      ctx.fillRect(Math.round(px - bodyR * 0.7), Math.round(py + bodyR * 0.15), bodyR * 1.4, 2)
    }
    if (boat) drawBoat(ctx, px, py, t, !boat.building && t - motion.movedAt <= 120, boat.building)
    if (org.is_leader) {
      ctx.fillStyle = '#f2c84b'
      ctx.fillRect(Math.round(px - 4), Math.round(spriteTop - 2), 8, 2)
    }

    // Names that would sit on top of another are left out; the selected person's always shows.
    const showName =
      !!org.name &&
      (isSelected ||
        (characterDetail !== 'overview' && viewFlags.names && (!labelIds || labelIds.has(org.id))))
    if (
      showName &&
      placer.place(px, spriteTop - 2, labelWidth(personName(org), isSelected ? 10 : 9), 10, isSelected)
    ) {
      drawName(ctx, org, px, spriteTop - 2, isSelected)
    }
  }
  ctx.imageSmoothingEnabled = smoothing
  ctx.globalAlpha = 1
}

function drawName(ctx: CanvasRenderingContext2D, org: OrganismState, x: number, y: number, bold: boolean) {
  ctx.font = bold ? 'bold 10px monospace' : '9px monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.lineWidth = 3
  ctx.strokeStyle = 'rgba(0,0,0,0.85)'
  ctx.strokeText(personName(org), x, y)
  ctx.fillStyle = '#ffffff'
  ctx.fillText(personName(org), x, y)
}
