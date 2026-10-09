import { lineageColor } from '../../../../shared/constants'
import { motionTime } from '../../../../shared/motion'
import { TILE } from '../../../model/palette'
import { strategyBeaconPositions, strategyTimeLabel } from '../../../model/strategy-visuals'
import { zoomDetailLevel } from '../../character-visuals'
import { battleAge, drawBattle } from '../../battles'
import { drawFestival } from '../../festivals'
import { drawEraTraffic } from '../../rails'
import { labelScale } from '../../settlement-labels'
import { drawSmog } from '../../smog'
import { drawWard } from '../../wards'
import type { CfFrame } from './frame'
import { painterView } from './frame'

type Ctx = CanvasRenderingContext2D

/**
 * Objects are painted only where the camera can see them. Each one's own extent (a beacon's label is
 * the widest) is allowed for in the margin, so an object just off the edge still draws the part that
 * reaches the screen.
 */
const EXTENT_MARGIN = TILE * 24

/** Strategy beacons, smog, era traffic, battles, festivals and wards (the old `draw_effects`). */
export function paintEffects(ctx: Ctx, f: CfFrame): void {
  const { world, zoom, ox, oy, organisms, t } = f
  const view = painterView(f, EXTENT_MARGIN)
  const seen = (x: number, y: number) => x >= view.x0 && x <= view.x1 && y >= view.y0 && y <= view.y1
  if (world.lineage_strategies) {
    const beacons = strategyBeaconPositions(
      world.lineage_strategies,
      world.tick,
      world.settlements,
      world.lineage_homes,
      organisms,
    )
    for (const { strategy, x: wx, y: wy } of beacons) {
      const centerX = (wx - ox) * TILE + TILE / 2
      const centerY = (wy - oy) * TILE + TILE / 2
      if (!seen(centerX, centerY)) continue
      const pulse = 22 + Math.sin(t * 0.003 + wx * 0.11 + wy * 0.07) * 4
      ctx.save()
      ctx.globalAlpha = 0.82
      ctx.strokeStyle = strategy.color
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.arc(centerX, centerY, pulse, 0, Math.PI * 2)
      ctx.stroke()
      ctx.globalAlpha = 0.28
      ctx.beginPath()
      ctx.arc(centerX, centerY, pulse + 7, 0, Math.PI * 2)
      ctx.stroke()

      const label = `${strategy.symbol} ${strategy.label} · ${strategyTimeLabel(strategy.ticksRemaining)}`
      ctx.font = 'bold 11px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const labelWidth = ctx.measureText(label).width + 12
      const labelY = centerY - pulse - 12
      ctx.globalAlpha = 0.92
      ctx.fillStyle = '#11181c'
      ctx.fillRect(centerX - labelWidth / 2, labelY - 8, labelWidth, 16)
      ctx.globalAlpha = 1
      ctx.strokeStyle = strategy.color
      ctx.lineWidth = 1
      ctx.strokeRect(centerX - labelWidth / 2, labelY - 8, labelWidth, 16)
      ctx.fillStyle = strategy.color
      ctx.fillText(label, centerX, labelY + 0.5)
      ctx.restore()
    }
  }

  for (const source of world.smog ?? []) {
    const sx = (source.x - ox) * TILE
    const sy = (source.y - oy) * TILE
    if (!seen(sx, sy)) continue
    drawSmog(ctx, source, sx, sy, TILE, motionTime(t))
  }
  // Aircraft and rockets are small moving marks: they are for close zoom, not the whole-map view.
  if (zoomDetailLevel(zoom) !== 'overview') drawEraTraffic(ctx, world, ox, oy, f.W, f.H, zoom, t)
  for (const battle of world.battles ?? []) {
    const age = battleAge(battle, world.tick)
    if (age === null) continue
    const [bx, by] = battle.location
    const cx = (bx - ox) * TILE + TILE / 2
    const cy = (by - oy) * TILE + TILE / 2
    if (!seen(cx, cy)) continue
    drawBattle(
      ctx,
      battle,
      cx,
      cy,
      TILE,
      labelScale(zoom),
      lineageColor(battle.attackers[0]),
      lineageColor(battle.defenders[0]),
      motionTime(t),
      age,
    )
  }
  for (const fest of world.festivals ?? []) {
    if (fest.x === undefined || fest.y === undefined) continue
    const cx = (fest.x - ox) * TILE + TILE / 2
    const cy = (fest.y - oy) * TILE + TILE / 2
    if (!seen(cx, cy)) continue
    drawFestival(ctx, fest, cx, cy, TILE, world.tick, motionTime(t), lineageColor(fest.lineage_id))
  }
  for (const ward of world.wards ?? []) {
    const cx = (ward.x - ox) * TILE + TILE / 2
    const cy = (ward.y - oy) * TILE + TILE / 2
    if (!seen(cx, cy)) continue
    drawWard(ctx, ward, cx, cy, TILE, world.tick, motionTime(t))
  }
}
