import { lineageEraTiers } from '.././draw-helpers'

import { drawBuilding, RUIN_CRUMBLE_TICKS, sortBuildingsByDepth } from '.././buildings2d'

import { padEmpty } from '.././era-traffic'

import { zoomDetailLevel } from '.././character-visuals'
import { TILE } from '../../model/palette'

import type { DrawFrame } from './frame'

/** The buildings in view, back to front (the 2D fallback). */
export function draw_buildings(f: DrawFrame) {
  const { ctx, world, cameraZoom, ox, oy, r0, r1, c0, c1 } = f
  if (!world.buildings || world.buildings.length === 0) return
  // Viewport-clip the building loop. A generous 6-tile margin covers the tallest building
  // footprints without false-negative culling.
  const BLDG_MARGIN = 6
  const cxLo = c0 - BLDG_MARGIN
  const cxHi = c1 + BLDG_MARGIN
  const ryLo = r0 - BLDG_MARGIN
  const ryHi = r1 + BLDG_MARGIN
  const bdp = world.day_progress ?? 0.5
  const bNight = world.is_day ? 0 : Math.max(0, Math.min(1, 1 - Math.abs(bdp - 0.5) * 2))
  const buildingDetail = zoomDetailLevel(cameraZoom)
  const sorted = sortBuildingsByDepth(
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
        // The sim sends the owner as `lineage_id`; reading only `owner_lineage` left every building
        // in the Stone Age style.
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
}
