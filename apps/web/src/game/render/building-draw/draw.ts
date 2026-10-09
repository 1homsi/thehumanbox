import { getBuildingSprite, hasBuildingSprite, PAD, PAD_BOT } from '../building-sprites'
import { getBuildingState } from '../../model/building-state'
import { buildingEmoji } from './emoji'
import { normKind, resolveBuildingFootprint } from './footprints'
import type { BuildingLike, BuildingVisualDetail } from './types'
import { isHouseLike, roofColor, wallColor } from './colors'
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
  const cond = building.condition ?? 1
  const structural = getBuildingState(building)
  const k = normKind(building.kind)

  drawBuildingShadow(ctx, px, py, w, h, tileSize)

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
      )
    }
    return
  }

  if (!structural.isComplete) {
    drawConstructionSite(ctx, building, structural, px, py, w, h, tileSize, detail)
    return
  }

  if (hasBuildingSprite(k)) {
    const variant =
      (((building.id ?? 0) * 2654435761) ^ (building.x * 73856093) ^ (building.y * 19349663)) >>> 0
    const nightBucket = Math.max(0, Math.min(3, Math.round(nightFactor * 3)))
    const condBucket = structural.integrity < 0.45 ? 0 : 1
    const sprite = getBuildingSprite(
      k,
      fw,
      fh,
      tileSize,
      variant & 7,
      nightBucket,
      condBucket,
      building.tier ?? 0,
      building.state ?? '',
      building.snow ?? false,
      building.land ?? '',
      building.roofTint ?? '',
    )
    if (sprite) {
      ctx.drawImage(sprite, Math.round(px - PAD), Math.round(py + h + PAD_BOT - sprite.height))
      drawBuildingDamage(ctx, building, structural, px, py, w, h, tileSize, detail)
      return
    }
  }

  if (isHouseLike(k)) {
    const wallH = h * 0.62
    const roofH = h * 0.42
    const wallY = py + h - wallH
    const wall = wallColor(k)
    const roof = roofColor(k) ?? '#5a2818'

    const foundH = Math.max(2, tileSize * 0.18)
    const foundOver = Math.max(1, tileSize * 0.1)
    ctx.fillStyle = 'rgba(28,22,16,0.85)'
    ctx.fillRect(px - foundOver, py + h - foundH, w + foundOver * 2, foundH + foundOver)
    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    ctx.fillRect(px - foundOver, py + h + foundOver - 1, w + foundOver * 2, 1)

    ctx.fillStyle = wall
    ctx.fillRect(px, wallY, w, wallH)
    ctx.fillStyle = 'rgba(0,0,0,0.18)'
    ctx.fillRect(px, wallY, w, Math.max(2, wallH * 0.1))
    ctx.fillStyle = 'rgba(0,0,0,0.22)'
    ctx.fillRect(px, py + h - Math.max(2, wallH * 0.14), w, Math.max(2, wallH * 0.14))

    ctx.fillStyle = roof
    ctx.beginPath()
    ctx.moveTo(px - tileSize * 0.18, wallY)
    ctx.lineTo(px + w + tileSize * 0.18, wallY)
    ctx.lineTo(px + w / 2, wallY - roofH)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.10)'
    ctx.beginPath()
    ctx.moveTo(px + w / 2, wallY - roofH)
    ctx.lineTo(px + w + tileSize * 0.18, wallY)
    ctx.lineTo(px + w * 0.62, wallY)
    ctx.closePath()
    ctx.fill()

    const doorW = Math.max(3, tileSize * 0.5)
    const doorH = Math.max(4, wallH * 0.55)
    ctx.fillStyle = '#2a1a10'
    ctx.fillRect(px + w / 2 - doorW / 2, py + h - doorH, doorW, doorH)
    ctx.fillStyle = '#d8c060'
    ctx.fillRect(px + w / 2 + doorW / 2 - 2, py + h - doorH / 2 - 1, 1.5, 1.5)

    const cols = Math.max(1, fw)
    const rows = Math.max(1, Math.floor(wallH / Math.max(6, tileSize * 0.5)))
    const winSize = Math.max(2, tileSize * 0.28)
    const winGapX = w / (cols + 1)
    const winGapY = wallH / (rows + 1)
    ctx.fillStyle = `rgba(220,230,255,${0.55 + cond * 0.3})`
    for (let r = 1; r <= rows; r++) {
      for (let c = 1; c <= cols; c++) {
        const wx = px + c * winGapX - winSize / 2
        const wy = wallY + r * winGapY - winSize / 2
        if (Math.abs(wx + winSize / 2 - (px + w / 2)) < doorW / 2 + 2 && wy + winSize > py + h - doorH)
          continue
        ctx.fillRect(wx, wy, winSize, winSize)
      }
    }
    ctx.strokeStyle = `rgba(0,0,0,${0.3})`
    ctx.lineWidth = 1
    ctx.strokeRect(px + 0.5, wallY + 0.5, w - 1, wallH - 1)
    const emoji = buildingEmoji(building.kind)
    const fontPx = Math.max(8, Math.min(w, h) * 0.32)
    ctx.save()
    ctx.font = `${fontPx}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.globalAlpha = 0.85
    ctx.fillText(emoji, px + w / 2, py + h * 0.18)
    ctx.restore()
  } else {
    const baseH = Math.max(3, tileSize * 0.32)
    const baseY = py + h - baseH
    const baseInset = Math.max(1, tileSize * 0.12)
    ctx.fillStyle = 'rgba(72, 56, 42, 0.85)'
    ctx.fillRect(px + baseInset, baseY, w - baseInset * 2, baseH)
    ctx.fillStyle = 'rgba(255,255,255,0.08)'
    ctx.fillRect(px + baseInset, baseY, w - baseInset * 2, Math.max(1, baseH * 0.18))
    ctx.fillStyle = 'rgba(0,0,0,0.30)'
    ctx.fillRect(px + baseInset, baseY + baseH - 1, w - baseInset * 2, 1)

    const emoji = buildingEmoji(building.kind)
    const fontPx = Math.max(10, Math.min(w, h) * 0.62)
    ctx.save()
    ctx.font = `${fontPx}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.globalAlpha = 0.95
    ctx.fillText(emoji, px + w / 2, baseY + 1)
    ctx.restore()
  }
  drawBuildingDamage(ctx, building, structural, px, py, w, h, tileSize, detail)
}
