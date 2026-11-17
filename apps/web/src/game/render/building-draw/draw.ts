import { PAD, PAD_BOT } from '../building-sprites'
import { finishedSprite } from './finished-sprite'
import { getBuildingState } from '../../model/building-state'
import { normKind, resolveBuildingFootprint } from './footprints'
import type { BuildingLike, BuildingVisualDetail } from './types'
import { drawBuildingShadow } from './primitives'
import { drawConstructionSite } from './construction'
import { drawBuildingDamage, drawRuinedBuilding } from './ruins'

export function drawBuilding(
  ctx: CanvasRenderingContext2D,
  building: BuildingLike,
  ox: number,
  oy: number,
  tileSize: number,
  nightFactor = 0,
  detail: BuildingVisualDetail = 'standard',
) {
  const [fw, fh] = resolveBuildingFootprint(building)
  const px = (building.x - ox) * tileSize
  const py = (building.y - oy) * tileSize
  const w = fw * tileSize
  const h = fh * tileSize
  const structural = getBuildingState(building)
  const k = normKind(building.kind)

  // A finished sprite carries its own cast shadow (see getBuildingSprite); a site or a ruin gets the flat footprint one.
  if (!structural.isComplete || structural.isRuined) drawBuildingShadow(ctx, px, py, w, h, tileSize)

  if (structural.isRuined) {
    const rebuilding = structural.integrity > 0.08
    drawRuinedBuilding(
      ctx,
      building,
      rebuilding ? { ...structural, isRepairing: false } : structural,
      px,
      py,
      w,
      h,
      tileSize,
      rebuilding ? 'overview' : detail,
    )
    // Repair progress persists even between worker visits. Reuse the actual
    // construction stages so restored masonry rises out of the old footprint.
    if (rebuilding) {
      drawConstructionSite(
        ctx,
        building,
        { ...structural, constructionProgress: structural.integrity },
        px,
        py,
        w,
        h,
        tileSize,
        detail,
        nightFactor,
      )
    }
    return
  }

  if (!structural.isComplete) {
    drawConstructionSite(ctx, building, structural, px, py, w, h, tileSize, detail, nightFactor)
    return
  }

  // Every kind has a drawing; one the map does not know yet is drawn as a plain house (see getBuildingSprite).
  const sprite = finishedSprite(
    building,
    k,
    fw,
    fh,
    tileSize,
    nightFactor,
    structural.integrity < 0.45 ? 0 : 1,
  )
  if (sprite) ctx.drawImage(sprite, Math.round(px - PAD), Math.round(py + h + PAD_BOT - sprite.height))
  drawBuildingDamage(ctx, building, structural, px, py, w, h, tileSize, detail)
}
