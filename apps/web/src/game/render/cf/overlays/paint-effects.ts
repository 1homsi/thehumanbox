import { lineageColor } from '../../../../shared/constants'
import { motionTime } from '../../../../shared/motion'
import { TILE } from '../../../model/palette'
import { strategyBeaconPositions, strategyTimeLabel } from '../../../model/strategy-visuals'
import { battleAge, drawBattle } from '../../battles'
import { drawFestival } from '../../festivals'
import { drawEraTraffic } from '../../rails'
import { labelScale } from '../../settlement-labels'
import { drawSmog } from '../../smog'
import { drawWard } from '../../wards'
import type { CfFrame } from './frame'

type Ctx = CanvasRenderingContext2D

/** Strategy beacons, smog, era traffic, battles, festivals and wards (the old `draw_effects`). */
export function paintEffects(ctx: Ctx, f: CfFrame): void {
  const { world, zoom, ox, oy, organisms, W, H, t } = f
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
      if (centerX < -32 || centerX > W + 32 || centerY < -32 || centerY > H + 32) continue
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
    drawSmog(ctx, source, (source.x - ox) * TILE, (source.y - oy) * TILE, TILE, motionTime(t))
  }
  drawEraTraffic(ctx, world, ox, oy, W, H, zoom, t)
  for (const battle of world.battles ?? []) {
    const age = battleAge(battle, world.tick)
    if (age === null) continue
    const [bx, by] = battle.location
    drawBattle(
      ctx,
      battle,
      (bx - ox) * TILE + TILE / 2,
      (by - oy) * TILE + TILE / 2,
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
    drawFestival(
      ctx,
      fest,
      (fest.x - ox) * TILE + TILE / 2,
      (fest.y - oy) * TILE + TILE / 2,
      TILE,
      world.tick,
      motionTime(t),
      lineageColor(fest.lineage_id),
    )
  }
  for (const ward of world.wards ?? []) {
    drawWard(
      ctx,
      ward,
      (ward.x - ox) * TILE + TILE / 2,
      (ward.y - oy) * TILE + TILE / 2,
      TILE,
      world.tick,
      motionTime(t),
    )
  }
}
