import { TILE } from '../../../model/palette'
import { prayerTimeLeft } from '../../../model/prayers'
import { drawPrayerBubble, mergePrayerBubbles, prayerBubbleScale } from '../../prayer-bubbles'
import { drawPrayerFeedback, updatePrayerFeedback } from '../../prayer-feedback'
import { drawSettlementLabels, subFont, titleFont, type PlacedLabel } from '../../settlement-labels'
import { drawBlessings, drawFireworks, updateWorldMoments } from '../../world-moments'
import type { CfFrame } from './frame'
import { collectSettlementLabels, placeLabels } from './settlement-label-list'

type Ctx = CanvasRenderingContext2D

/** Settlement names, world moments, prayer bubbles and effects, and the tile grid (the old `draw_hud`). */
export function paintHud(ctx: Ctx, f: CfFrame, opts: { grid: boolean }): { labels: PlacedLabel[] } {
  const { world, viewFlags, zoom, ox, oy, W, H, t, bounds } = f
  let placed: PlacedLabel[] = []
  if (!viewFlags.hideUI) {
    const measure = (text: string, kind: 'major' | 'minor' | 'sub') => {
      ctx.font = kind === 'sub' ? subFont(1) : titleFont(kind === 'major', 1)
      return ctx.measureText(text).width
    }
    placed = placeLabels(collectSettlementLabels(world, bounds, zoom), zoom, measure, W, H)
  }
  if (placed.length > 0) drawSettlementLabels(ctx, placed)

  updateWorldMoments(world, t)
  const toPx = (x: number, y: number): [number, number] => [(x - ox) * TILE + TILE / 2, (y - oy) * TILE]
  drawBlessings(ctx, world, toPx, t)
  drawFireworks(ctx, toPx, t)

  updatePrayerFeedback(world.prayers, world.faith, t)
  if (!viewFlags.hideUI) {
    drawPrayerFeedback(
      ctx,
      (x, y) => [(x - ox) * TILE + TILE / 2, (y - oy) * TILE],
      Math.max(1, 1.6 / Math.max(0.05, zoom)),
      t,
    )
  }
  if (world.prayers && world.prayers.length > 0 && !viewFlags.hideUI) {
    const bubbleScale = prayerBubbleScale(zoom)
    const merged = mergePrayerBubbles(
      world.prayers.map((prayer) => ({
        prayer,
        x: (prayer.x - ox) * TILE + TILE / 2,
        y: (prayer.y - oy) * TILE,
        left: prayerTimeLeft(prayer, world.tick),
      })),
      16 * bubbleScale,
    )
    for (const { x, y, prayer, left, count } of merged) {
      if (x < -32 || x > W + 32 || y < -32 || y > H + 32) continue
      ctx.save()
      ctx.translate(Math.round(x), Math.round(y - 8))
      ctx.scale(bubbleScale, bubbleScale)
      drawPrayerBubble(ctx, 0, 0, prayer.kind, left, t, prayer.x + prayer.y, count)
      ctx.restore()
    }
  }

  if (opts.grid) {
    // Only the lines in view: the canvas painter stroked every line of the world and let the clip drop most.
    ctx.fillStyle = 'rgba(255,255,255,0.06)'
    const { c0, c1, r0, r1 } = bounds
    for (let x = c0; x <= c1; x++) ctx.fillRect(x * TILE - 0.25, r0 * TILE, 0.5, (r1 - r0) * TILE)
    for (let y = r0; y <= r1; y++) ctx.fillRect(c0 * TILE, y * TILE - 0.25, (c1 - c0) * TILE, 0.5)
  }
  return { labels: placed }
}
