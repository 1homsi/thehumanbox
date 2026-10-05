import { ERA_STRIPE_COLOR, SPECIALTY_EMOJI, _orgLastPos, orgMotion, pickToolEmoji } from '.././draw-helpers'
import { drawBoat } from '.././boat-sprite'
import { crowdLabelIds, LabelPlacer, labelWidth } from '.././crowd-detail'
import { drawWorkActivity, workActivity } from '.././activity-visuals'

import { drawEmote, emoteFor } from '.././activity-emotes'
import type { OrganismState, WorldState } from '../../../shared/types'

import { lineageColor } from '../../../shared/constants'
import { drawPeopleTile, getPeopleAtlas, pickHumanSprite } from '../../../shared/sprites'

import { normalizeLineageEras } from '../../../shared/lineageEras'

import { celebrating, drawCelebrationGlyph, drawPrayingGlyph } from '.././prayer-feedback'

import {
  deterministicAppearanceIndex,
  resolveAgeStage,
  zoomDetailLevel,
  characterFrame,
  compareCharacterDepth,
  selectCrowdSpriteRepresentatives,
} from '.././character-visuals'
import { TILE, THOUGHT_COLORS } from '../../model/palette'
import { orgVariant } from '../../model/org-variant'

import { spriteLayerActive } from '../cf/people/bridge'

import type { DrawFrame } from './frame'

/** The population: shadows, sprites, motion, boats, thoughts and name tags. */
export function draw_people(f: DrawFrame) {
  const {
    ctx,
    world,
    selectedOrgId,
    focus,
    viewFlags,
    cameraZoom,
    ox,
    oy,
    r0,
    r1,
    c0,
    c1,
    organisms,
    t,
    ruinedTiles,
    placedSettlementLabels,
  } = f
  // With the sprite layer mounted, bodies, boats, shadows, rings, bars and icons are
  // drawn by the GPU. The canvas keeps what a sprite cannot carry: names, thoughts,
  // emotes, work poses and prayer glyphs.
  const glActive = spriteLayerActive('people')
  if (glActive && zoomDetailLevel(cameraZoom) === 'overview' && selectedOrgId == null) return
  const lineageErasMap = normalizeLineageEras(world.lineage_eras)

  const isFocused = (org: WorldState['organisms'][0]) => {
    if (focus === 'all') return true
    if (focus.startsWith('lineage:')) return org.lineage_id === focus.slice(8)
    if (focus === 'sick') return org.infection > 0.15
    if (focus === 'hungry') return org.energy < 0.3
    if (focus === 'elders') return !!org.is_elder
    if (focus === 'builders')
      return !!(org.discoveries ?? []).some((d) =>
        ['shelter', 'fire', 'masonry', 'stone_tools', 'spear'].includes(d),
      )
    if (focus === 'thriving') return org.energy > 0.8 && org.hydration > 0.8
    return true
  }

  // Canvas clipping saves pixels, but does not skip sprite work or text
  // measurement. Cull before sorting and drawing off-screen people.
  const visibleOrganisms = organisms.filter(
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
  const characterDetail = zoomDetailLevel(cameraZoom)
  // Dense crowds contain many sprites on the same eight-pixel tile. Preserve
  // individual animation nearby, but cap overlapping atlas draws when the
  // viewport holds thousands of people. Selection and boats stay visible.
  const allDrawn =
    visibleOrganisms.length > 6000
      ? selectCrowdSpriteRepresentatives(
          visibleOrganisms,
          characterDetail === 'overview' ? 1 : characterDetail === 'detail' ? 3 : 2,
          characterDetail === 'overview' ? Math.min(8, Math.max(2, Math.ceil(1 / cameraZoom))) : 1,
          selectedOrgId,
          new Set(boatsByRider.keys()),
        )
      : visibleOrganisms
  const crowded = visibleOrganisms.length > 400
  const labelIds =
    characterDetail !== 'overview' && viewFlags.names ? crowdLabelIds(allDrawn, cameraZoom) : null
  // Where each praying tribe gathers, for the raised-hands glyphs.
  const prayerSpots = new Map((world.prayers ?? []).map((p) => [p.lineage_id, p] as const))
  // With the sprite layer drawing bodies and emotes, only people who still need the
  // canvas (a name, a thought, a work pose, a prayer glyph) are visited at all.
  const drawnOrganisms = glActive
    ? allDrawn.filter(
        (org) =>
          org.id === selectedOrgId ||
          (characterDetail !== 'overview' &&
            ((viewFlags.names && !!org.name && (!labelIds || labelIds.has(org.id))) ||
              (characterDetail === 'detail' &&
                viewFlags.thoughts &&
                !!org.thought &&
                org.thought !== 'observing') ||
              workActivity(org.thought ?? '', false) !== null ||
              (!viewFlags.hideUI &&
                (prayerSpots.has(org.lineage_id) || celebrating(org.lineage_id, org.x, org.y, t))))),
      )
    : allDrawn
  if (_orgLastPos.size > Math.max(512, drawnOrganisms.length * 3)) {
    const drawnIds = new Set(drawnOrganisms.map((organism) => organism.id))
    for (const id of _orgLastPos.keys()) {
      if (!drawnIds.has(id)) _orgLastPos.delete(id)
    }
  }
  for (const boat of world.vehicles ?? []) {
    if (
      glActive ||
      boat.kind !== 'boat' ||
      boat.rider_id ||
      boat.x - ox < c0 - 3 ||
      boat.x - ox > c1 + 3 ||
      boat.y - oy < r0 - 3 ||
      boat.y - oy > r1 + 3
    )
      continue
    drawBoat(ctx, (boat.x - ox) * TILE + TILE / 2, (boat.y - oy) * TILE + TILE / 2, t, false)
  }
  for (const org of drawnOrganisms) orgMotion(org.id, org.x, org.y, t)
  const restingAtHome = (org: OrganismState) => {
    if (org.home_x == null || org.home_y == null) return false
    if (ruinedTiles.size > 0 && ruinedTiles.has(`${Math.floor(org.home_x)},${Math.floor(org.home_y)}`))
      return false
    const motion = _orgLastPos.get(org.id)
    if (motion && t - motion.movedAt <= 120) return false
    const dx = org.x - org.home_x
    const dy = org.y - org.home_y
    return dx * dx + dy * dy < 2 && ((org.sleep_debt ?? 0) > 0.4 || org.energy < 0.1 || org.health < 0.15)
  }
  const labelPlacer = new LabelPlacer()
  for (const p of placedSettlementLabels) labelPlacer.place(p.cx, p.cy + p.h / 2, p.w, p.h, true)
  // Batch every organism shadow into two paths (focused / dimmed) so the
  // whole population costs two fills instead of hundreds of separate
  // beginPath/ellipse/fill draw calls per frame.
  if (!glActive && characterDetail !== 'overview' && !crowded) {
    const focusedShadows = new Path2D()
    const dimShadows = new Path2D()
    let any = false
    for (const org of drawnOrganisms) {
      if (!org.alive) continue
      if (restingAtHome(org)) continue
      const px = (org.x - ox) * TILE + TILE / 2
      const py = (org.y - oy) * TILE + TILE / 2
      const variant = orgVariant(org.id)
      const bodyR = variant.bodyRadius * (org.sex === 'male' ? 1.05 : 0.95)
      const spriteSize = Math.round(Math.max(19, bodyR * 3.8))
      const target = isFocused(org) ? focusedShadows : dimShadows
      const shadowCx = px + 1
      const shadowCy = py + spriteSize * 0.2
      const shadowRx = spriteSize * 0.27
      // moveTo to the ellipse's own start point first - ellipse()/arc() on a
      // Path2D that already has a current point implicitly draws a straight
      // line from there to the new arc's start. Without this, consecutive
      // organisms' shadows in this shared path get bridged by an invisible
      // edge (and the final fill's implicit close), which at low zoom reads
      // as huge black wedges connecting unrelated organisms across the map.
      target.moveTo(shadowCx + shadowRx, shadowCy)
      target.ellipse(shadowCx, shadowCy, shadowRx, spriteSize * 0.1, 0, 0, Math.PI * 2)
      any = true
    }
    if (any) {
      ctx.fillStyle = 'rgba(0,0,0,0.4)'
      ctx.globalAlpha = 0.12
      ctx.fill(dimShadows)
      ctx.globalAlpha = 1
      ctx.fill(focusedShadows)
    }
  }
  // Sample atlas readiness/source once and keep nearest-neighbor sampling for
  // the population pass instead of checking and toggling it for every sprite.
  const peopleAtlas = getPeopleAtlas()
  const populationSmoothing = ctx.imageSmoothingEnabled
  ctx.imageSmoothingEnabled = false
  for (const org of drawnOrganisms.sort(compareCharacterDepth)) {
    if (!org.alive) continue
    if (restingAtHome(org)) continue
    const px = (org.x - ox) * TILE + TILE / 2
    const py = (org.y - oy) * TILE + TILE / 2
    const focused = isFocused(org)
    const isSelected = org.id === selectedOrgId
    const fullDetail = isSelected || characterDetail === 'detail'
    const standardDetail = isSelected || characterDetail !== 'overview'
    const variant = orgVariant(org.id)
    const bodyR = variant.bodyRadius * (org.sex === 'male' ? 1.05 : 0.95)
    const orgSex: 'male' | 'female' = org.sex === 'female' ? 'female' : 'male'
    const stage = resolveAgeStage(org)
    // The atlas owns age-specific proportions. Keeping one destination box
    // prevents infants and children from being scaled down twice.
    const spriteSize = Math.round(Math.max(19, bodyR * 3.8))
    const spriteTop = py - spriteSize * 0.78
    ctx.globalAlpha = focused ? 1 : 0.12

    const isSignaling = org.thought.startsWith('"') || org.thought.startsWith("'")
    if (!glActive && standardDetail && (isSignaling || org.thought === 'sounding alarm')) {
      ctx.strokeStyle =
        org.thought.includes('!') || org.thought === 'sounding alarm'
          ? 'rgba(255,68,136,0.6)'
          : 'rgba(255,255,68,0.6)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(px, py, 10, 0, Math.PI * 2)
      ctx.stroke()
    } else if (
      !glActive &&
      standardDetail &&
      (org.thought === 'challenging' || org.thought === 'challenging alone')
    ) {
      ctx.strokeStyle = org.thought === 'challenging' ? 'rgba(255,34,0,0.85)' : 'rgba(204,68,34,0.7)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(px, py - 11)
      ctx.lineTo(px + 11, py)
      ctx.lineTo(px, py + 11)
      ctx.lineTo(px - 11, py)
      ctx.closePath()
      ctx.stroke()
    }

    if (!glActive && standardDetail && org.infection > 0.15) {
      ctx.beginPath()
      ctx.arc(px, py, 8, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(187,255,68,${org.infection * 0.3})`
      ctx.fill()
    }

    if (isSelected && !glActive) {
      ctx.save()
      ctx.beginPath()
      ctx.ellipse(px, py + 2, spriteSize * 0.42, spriteSize * 0.24, 0, 0, Math.PI * 2)
      // soft warm halo makes the selection readable over any biome
      ctx.strokeStyle = 'rgba(255, 210, 138, 0.35)'
      ctx.lineWidth = 3.5
      ctx.stroke()
      ctx.strokeStyle = 'rgba(255,255,255,0.95)'
      ctx.lineWidth = 1.5
      ctx.setLineDash([3, 2])
      ctx.lineDashOffset = -t * 0.01
      ctx.stroke()
      ctx.restore()
    }

    if (!glActive && standardDetail && (!crowded || isSelected) && org.lineage_id) {
      ctx.strokeStyle = lineageColor(org.lineage_id)
      ctx.lineWidth = org.traits ? 0.75 + org.traits.resilience : 1
      ctx.beginPath()
      ctx.ellipse(px, py + 3, spriteSize * 0.34, spriteSize * 0.17, 0, 0, Math.PI * 2)
      ctx.stroke()
    }

    // Keep simulation state visible as a restrained aura, not an opaque shape
    // painted over the character art.
    let bodyFill: string
    if (org.infection > 0.38) bodyFill = 'hsl(85,60%,48%)'
    else if ((org.fear_level ?? 0) > 0.72) bodyFill = 'hsl(10,70%,48%)'
    else if ((org.grief_ticks ?? 0) > 12) bodyFill = 'hsl(220,50%,50%)'
    else if ((org.joy_ticks ?? 0) > 30) bodyFill = 'hsl(45,80%,62%)'
    else if (org.energy < 0.12) bodyFill = 'hsl(38,55%,38%)'
    else bodyFill = THOUGHT_COLORS[org.thought] ?? '#cccccc'

    if (viewFlags.health) {
      const h = Math.max(0, Math.min(1, org.health))
      const r = Math.round(220 * (1 - h) + 80 * h)
      const g = Math.round(80 * (1 - h) + 200 * h)
      const b = Math.round(80 * (1 - h) + 100 * h)
      bodyFill = `rgb(${r},${g},${b})`
    } else if (viewFlags.age) {
      if (stage === 'elder') bodyFill = '#e9c87a'
      else if (stage === 'infant' || stage === 'child') bodyFill = '#8db5d6'
      else bodyFill = '#b8b8a8'
    }
    if (!glActive && (isSelected || viewFlags.health || viewFlags.age || (standardDetail && !crowded))) {
      ctx.save()
      ctx.globalAlpha *= viewFlags.health || viewFlags.age ? 0.3 : standardDetail ? 0.16 : 0.1
      ctx.fillStyle = bodyFill
      ctx.beginPath()
      ctx.arc(px, py, bodyR + 1.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
    if (!glActive && standardDetail && viewFlags.fear && (org.fear_level ?? 0) > 0.25) {
      const fa = Math.min(0.55, (org.fear_level ?? 0) * 0.8)
      ctx.beginPath()
      ctx.arc(px, py, bodyR + 4, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(220,70,70,${fa})`
      ctx.fill()
    }

    if (!glActive && standardDetail && viewFlags.lineageDot && org.lineage_id) {
      ctx.fillStyle = lineageColor(org.lineage_id)
      ctx.beginPath()
      ctx.arc(px, py + bodyR * 0.4, 1.6, 0, Math.PI * 2)
      ctx.fill()
    }

    if (!glActive && standardDetail && viewFlags.pregnancy && org.pregnant) {
      ctx.strokeStyle = 'rgba(255,220,120,0.9)'
      ctx.lineWidth = 1.3
      ctx.setLineDash([2, 2])
      ctx.beginPath()
      ctx.arc(px, py, bodyR + 2.5, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
    }

    const motion = _orgLastPos.get(org.id)!
    const boat = boatsByRider.get(org.id)
    const frame = boat ? 0 : characterFrame(motion, t)
    const drew =
      glActive ||
      drawPeopleTile(
        ctx,
        pickHumanSprite(orgSex, stage, frame, deterministicAppearanceIndex(org.id)),
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

    if (boat && !glActive)
      drawBoat(ctx, px, py, t, !boat.building && t - motion.movedAt <= 120, boat.building)
    if (standardDetail && !boat) {
      drawWorkActivity(
        ctx,
        workActivity(org.thought ?? '', t - motion.movedAt <= 120),
        px,
        py,
        motion.flipped,
        t,
        motion.phase,
      )
    }
    if (standardDetail && !glActive) {
      const emote = emoteFor(org)
      if (emote) drawEmote(ctx, emote, px, py - bodyR * 2.4, t, motion.phase)
    }

    const era = lineageErasMap[org.lineage_id] ?? ''
    if (!glActive && standardDetail && era && era !== 'pre-stone' && era !== 'stone') {
      ctx.save()
      ctx.fillStyle = ERA_STRIPE_COLOR[era] ?? 'rgba(255,255,255,0.0)'
      ctx.globalAlpha *= 0.75
      ctx.fillRect(Math.round(px - bodyR), Math.round(py + bodyR + 1), Math.round(bodyR * 2), 1)
      ctx.restore()
    }
    if (org.is_leader && !glActive) {
      const crownX = Math.round(px - 4)
      const crownY = Math.round(spriteTop - 2)
      ctx.fillStyle = '#f2c84b'
      ctx.fillRect(crownX, crownY, 8, 2)
      ctx.fillRect(crownX, crownY - 2, 2, 2)
      ctx.fillRect(crownX + 3, crownY - 3, 2, 3)
      ctx.fillRect(crownX + 6, crownY - 2, 2, 2)
    }
    const specEmoji = SPECIALTY_EMOJI[org.specialty ?? ''] ?? ''
    if (!glActive && fullDetail && specEmoji) {
      ctx.save()
      ctx.font = '7px serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(specEmoji, px + bodyR + 1, py - bodyR * 0.4)
      ctx.restore()
    }
    if (!glActive && standardDetail && org.diseases && org.diseases.length > 0) {
      ctx.save()
      ctx.font = '7px serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('\u{1F912}', px - bodyR - 1, py - bodyR * 0.4)
      ctx.restore()
    }
    if (!glActive && fullDetail && org.tools) {
      const toolEmoji = pickToolEmoji(org.tools)
      if (toolEmoji) {
        ctx.save()
        ctx.font = '8px serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(toolEmoji, px + bodyR + 4, py + bodyR * 0.6)
        ctx.restore()
      }
    }
    if (!glActive && fullDetail && org.degrees && org.degrees.length > 0) {
      ctx.save()
      ctx.font = '7px serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('\u{1F393}', px - bodyR - 4, py + bodyR * 0.6)
      ctx.restore()
    }

    if (!glActive && standardDetail && org.carrying > 0) {
      ctx.fillStyle = org.carrying_type === 2 ? '#9a9a9a' : '#8b5e3c'
      ctx.fillRect(Math.round(px + spriteSize * 0.2), Math.round(py - 1), 5, 4)
    }

    const showVitals = isSelected || org.energy < 0.22 || org.hydration < 0.22 || org.health < 0.22
    if (showVitals && !glActive) {
      const barW = Math.max(8, Math.round(spriteSize * 0.55))
      const bx = Math.round(px - barW / 2)
      const by = Math.round(spriteTop - 5)
      ctx.fillStyle = 'rgba(0,0,0,0.68)'
      ctx.fillRect(bx - 1, by - 1, barW + 2, 6)
      ctx.fillStyle = '#55dd55'
      ctx.fillRect(bx, by, Math.round(barW * Math.max(0, Math.min(1, org.energy))), 1)
      ctx.fillStyle = '#4499ff'
      ctx.fillRect(bx, by + 2, Math.round(barW * Math.max(0, Math.min(1, org.hydration))), 1)
      ctx.fillStyle = '#ff665c'
      ctx.fillRect(bx, by + 4, Math.round(barW * Math.max(0, Math.min(1, org.health))), 1)
    }

    // Someone born or spawned since the last full frame has no name yet;
    // drawing it printed the word "undefined".
    const showName =
      !!org.name && (isSelected || (standardDetail && viewFlags.names && (!labelIds || labelIds.has(org.id))))
    const showThought =
      (isSelected || (fullDetail && viewFlags.thoughts)) && org.thought && org.thought !== 'observing'
    const labelY = spriteTop - (showVitals ? 10 : 2)
    if (standardDetail && !viewFlags.hideUI) {
      const seed = org.id.charCodeAt(0) + org.id.charCodeAt(org.id.length - 1)
      const spot = prayerSpots.get(org.lineage_id)
      if (celebrating(org.lineage_id, org.x, org.y, t)) {
        drawCelebrationGlyph(ctx, px, spriteTop, t, seed)
      } else if (spot && seed % 2 === 0 && Math.hypot(org.x - spot.x, org.y - spot.y) <= 8) {
        drawPrayingGlyph(ctx, px, spriteTop, t, seed)
      }
    }
    // Names and thoughts that would sit on top of another label are left
    // out; the selected person's always shows.
    const nameShown =
      showName && labelPlacer.place(px, labelY, labelWidth(org.name, isSelected ? 10 : 9), 10, isSelected)
    const thoughtShown =
      showThought &&
      labelPlacer.place(px, labelY - (nameShown ? 10 : 0), labelWidth(org.thought ?? '', 8), 9, isSelected)

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
  ctx.imageSmoothingEnabled = populationSmoothing
  ctx.globalAlpha = 1
}
