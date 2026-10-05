import { drawTradeNetwork2D } from '.././base-layer'
import { lineageEraTiers } from '.././draw-helpers'

import { drawBuilding, RUIN_CRUMBLE_TICKS, sortBuildingsByDepth } from '.././buildings2d'

import { PERIL_HELP, remainingLine } from '../../model/tribe-peril'

import {
  labelScale,
  placeSettlementLabels,
  subFont,
  titleFont,
  type PlacedLabel,
  type SettlementLabel,
} from '.././settlement-labels'

import { padEmpty } from '.././era-traffic'

import { getBuildingState } from '../../model/building-state'

import { zoomDetailLevel } from '.././character-visuals'
import { TILE } from '../../model/palette'
import { cfOwns } from '../cf/ownership'

import type { DrawFrame } from './frame'

/** Buildings, caravans and the settlement name labels they produce. */
export function draw_buildings(f: DrawFrame) {
  const { ctx, world, viewFlags, cameraZoom, ox, oy, r0, r1, c0, c1, W, H, t } = f
  // Collected with the buildings, drawn above everything else on the map.
  const settlementLabels: SettlementLabel[] = []
  if (world.buildings && world.buildings.length > 0) {
    // Viewport-clip the building loop. Buildings are world-positioned;
    // c0/r0/c1/r1 are the tile-aligned visible window already computed
    // by the camera step. A generous 6-tile margin covers the tallest
    // building footprints without false-negative culling.
    const BLDG_MARGIN = 6
    const cxLo = c0 - BLDG_MARGIN
    const cxHi = c1 + BLDG_MARGIN
    const ryLo = r0 - BLDG_MARGIN
    const ryHi = r1 + BLDG_MARGIN
    const bdp = world.day_progress ?? 0.5
    const bNight = world.is_day ? 0 : Math.max(0, Math.min(1, 1 - Math.abs(bdp - 0.5) * 2))
    const buildingDetail = zoomDetailLevel(cameraZoom)
    // With ?cf=buildings the cubeforge SpriteLayer draws the buildings themselves;
    // the labels and caravans below still come from this pass.
    const sorted = cfOwns('buildings')
      ? []
      : sortBuildingsByDepth(
          world.buildings.filter(
            (b) => b.x - ox >= cxLo && b.x - ox <= cxHi && b.y - oy >= ryLo && b.y - oy <= ryHi,
          ),
        )
    const tiers = lineageEraTiers(world.lineage_eras)
    for (const b of sorted) {
      if (typeof b.x !== 'number' || typeof b.y !== 'number') continue
      drawBuilding(
        ctx,
        {
          id: b.id,
          kind: b.kind,
          x: b.x,
          y: b.y,
          condition: b.condition,
          damage: b.damage,
          integrity: b.integrity,
          ruined: b.ruined,
          repairing: b.repairing,
          footprint: b.footprint,
          fw: b.fw,
          fh: b.fh,
          // The sim sends the owner as `lineage_id`; reading only
          // `owner_lineage` left every building in the Stone Age style.
          tier: tiers.get(b.owner_lineage ?? b.lineage_id ?? '') ?? 0,
          ruinAge:
            b.ruined && b.ruined_at_tick != null ? (world.tick - b.ruined_at_tick) / RUIN_CRUMBLE_TICKS : 0,
          state: b.kind === 'Spaceport' && padEmpty(b.id, world.tick) ? 'empty' : undefined,
        },
        ox,
        oy,
        TILE,
        bNight,
        buildingDetail,
      )
    }
    type Cluster = {
      cx: number
      cy: number
      count: number
      lineage: string
      name?: string
      tier?: number
      tierName?: string
      population?: number
    }
    const clusters: Cluster[] = []
    const CITY_RADIUS_SQ = 14 * 14
    if (world.settlements?.length) {
      for (const settlement of world.settlements) {
        const [cx, cy] = settlement.center
        if (cx < cxLo || cx > cxHi || cy < ryLo || cy > ryHi) continue
        clusters.push({
          cx,
          cy,
          count: settlement.building_count,
          lineage: settlement.lineage_id,
          name: settlement.name,
          tier: settlement.tier,
          tierName: settlement.tier_name,
          population: settlement.population,
        })
      }
    } else {
      // Legacy snapshots lack authoritative settlements. Retain the old
      // visual clustering as a compatibility fallback only.
      for (const b of world.buildings) {
        if (!getBuildingState(b).isOperational) continue
        const lid = (b as { lineage_id?: string }).lineage_id ?? ''
        if (!lid) continue
        const bx = b.x
        const by = b.y
        if (bx < cxLo || bx > cxHi || by < ryLo || by > ryHi) continue
        const existing = clusters.find(
          (c) => c.lineage === lid && (c.cx - bx) ** 2 + (c.cy - by) ** 2 < CITY_RADIUS_SQ,
        )
        if (existing) {
          existing.cx = (existing.cx * existing.count + bx) / (existing.count + 1)
          existing.cy = (existing.cy * existing.count + by) / (existing.count + 1)
          existing.count++
        } else {
          clusters.push({ cx: bx, cy: by, count: 1, lineage: lid })
        }
      }
    }
    const lineageNames = world.lineage_names ?? {}
    // A tribe on the brink is always named, at every zoom, whatever its size.
    const perilBy = new Map((world.tribes_in_peril ?? []).map((p) => [p.lineage_id, p]))
    for (const c of clusters) {
      const major = (c.tier ?? (c.count >= 12 ? 5 : 0)) >= 5
      const peril = perilBy.get(c.lineage)
      const showSettlementLabel =
        c.tier !== 0 && !(c.tier === undefined && c.count < 4) && (buildingDetail !== 'overview' || major)
      if (!showSettlementLabel && !peril) continue
      const name = c.name ?? lineageNames[c.lineage] ?? c.lineage.slice(0, 6)
      const title =
        c.tier !== undefined
          ? c.tier >= 5
            ? `${name.toUpperCase()} CITY`
            : `${name} ${c.tierName ?? 'settlement'}`
          : c.count >= 12
            ? `${name.toUpperCase()} CITY`
            : c.count >= 8
              ? `${name} town`
              : `${name} village`
      settlementLabels.push({
        x: (c.cx - ox) * TILE,
        y: (c.cy - oy) * TILE,
        title,
        sub: peril
          ? `⚠ ${remainingLine(peril.population)} · ${PERIL_HELP[peril.cause].reason}`
          : c.population !== undefined
            ? `${c.population} people · ${c.count} buildings`
            : `${c.count} bldgs`,
        major,
        priority:
          (peril ? 1_000_000 : 0) +
          (c.tier ?? (c.count >= 12 ? 5 : c.count >= 8 ? 4 : 2)) * 10000 +
          (c.population ?? c.count),
        color: major ? '#ffd28a' : (c.tier ?? 0) >= 4 || c.count >= 8 ? '#e5c89a' : '#c8b890',
        alert: !!peril,
      })
    }
  }

  drawTradeNetwork2D(ctx, world, { c0, c1, r0, r1 }, t, 'caravans')
  // Town names claim their place before people's name tags, so the two never
  // pile on each other; the names step aside for the towns.
  let placedSettlementLabels: PlacedLabel[] = []
  if (settlementLabels.length > 0 && !viewFlags.hideUI) {
    const scale = labelScale(cameraZoom)
    const measure = (text: string, kind: 'major' | 'minor' | 'sub') => {
      ctx.font = kind === 'sub' ? subFont(1) : titleFont(kind === 'major', 1)
      return ctx.measureText(text).width
    }
    placedSettlementLabels = placeSettlementLabels(settlementLabels, scale, measure, { w: W, h: H }, TILE * 2)
  }
  f.placedSettlementLabels = placedSettlementLabels
}
