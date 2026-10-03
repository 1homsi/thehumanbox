import { drawBlessings, drawFireworks, updateWorldMoments } from '.././world-moments'
import { drawPrayerBubble, mergePrayerBubbles, prayerBubbleScale } from '.././prayer-bubbles'

import { drawSettlementLabels } from '.././settlement-labels'
import { drawPrayerFeedback, updatePrayerFeedback } from '.././prayer-feedback'

import { prayerTimeLeft } from '../../model/prayers'

import { TILE } from '../../model/palette'

import type { DrawFrame } from './frame'

const fpsSamples: number[] = []

/** Settlement labels, world moments, prayers, FPS counter and the grid. */
export function draw_hud(f: DrawFrame) {
  const {
    ctx,
    world,
    viewFlags,
    cameraZoom,
    width,
    height,
    ox,
    oy,
    organisms,
    W,
    H,
    t,
    placedSettlementLabels,
  } = f
  if (placedSettlementLabels.length > 0) drawSettlementLabels(ctx, placedSettlementLabels)
  updateWorldMoments(world, t)
  {
    const toPx = (x: number, y: number): [number, number] => [(x - ox) * TILE + TILE / 2, (y - oy) * TILE]
    drawBlessings(ctx, world, toPx, t)
    drawFireworks(ctx, toPx, t)
  }
  updatePrayerFeedback(world.prayers, world.faith, t)
  if (!viewFlags.hideUI) {
    drawPrayerFeedback(
      ctx,
      (x, y) => [(x - ox) * TILE + TILE / 2, (y - oy) * TILE],
      Math.max(1, 1.6 / Math.max(0.05, cameraZoom)),
      t,
    )
  }
  if (world.prayers && world.prayers.length > 0 && !viewFlags.hideUI) {
    // Keep bubbles readable when zoomed out: never smaller than ~21px on
    // screen, never larger than their pixel-art size when zoomed in.
    const bubbleScale = prayerBubbleScale(cameraZoom)
    // Bubbles that would overlap merge into one with a count, most urgent
    // on top, so a crowded valley doesn't turn into a pile of speech.
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

  if (viewFlags.fps) {
    fpsSamples.push(t)
    if (fpsSamples.length > 60) fpsSamples.shift()
    let fps = 0
    if (fpsSamples.length >= 2) {
      const span = fpsSamples[fpsSamples.length - 1] - fpsSamples[0]
      if (span > 0) fps = ((fpsSamples.length - 1) * 1000) / span
    }
    const text = `${fps.toFixed(0)} fps · ${organisms.filter((o) => o.alive).length} org`
    ctx.save()
    ctx.font = 'bold 10px monospace'
    ctx.textAlign = 'right'
    const padX = 6
    const tw = ctx.measureText(text).width
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fillRect(W - tw - padX * 2 - 4, 4, tw + padX * 2, 16)
    ctx.fillStyle = '#aaffdd'
    ctx.fillText(text, W - padX - 4, 16)
    ctx.restore()
  }

  if (viewFlags.grid) {
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'
    ctx.lineWidth = 0.5
    for (let x = 0; x <= width; x++) {
      ctx.beginPath()
      ctx.moveTo(x * TILE, 0)
      ctx.lineTo(x * TILE, H)
      ctx.stroke()
    }
    for (let y = 0; y <= height; y++) {
      ctx.beginPath()
      ctx.moveTo(0, y * TILE)
      ctx.lineTo(W, y * TILE)
      ctx.stroke()
    }
  }
}
