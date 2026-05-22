import type { SceneFixture } from '../../../scenes/core/types'
import { TILE_PX } from '../shared/RoomCanvas'

function drawAltar(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const w = TILE_PX * 3
  const h = TILE_PX * 2
  ctx.fillStyle = '#3a342a'
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = '#c4b894'
  ctx.fillRect(x + 1, y + 1, w - 2, h - 4)
  ctx.fillStyle = '#7c6e50'
  ctx.fillRect(x + 1, y + h - 6, w - 2, 2)
  ctx.fillStyle = '#3a342a'
  ctx.fillRect(x + 1, y + h - 4, w - 2, 4)
  ctx.fillStyle = '#e0d0a0'
  ctx.fillRect(x + 8, y + 6, w - 16, 4)
  ctx.fillStyle = '#9a8052'
  ctx.fillRect(x + 14, y + 12, 4, 6)
}

function drawCandle(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
  ctx.fillStyle = '#3a2a18'
  ctx.fillRect(x + 7, y + 10, 4, 2)
  ctx.fillStyle = '#e8dcb0'
  ctx.fillRect(x + 7, y + 5, 4, 6)
  ctx.fillStyle = '#b8a884'
  ctx.fillRect(x + 7, y + 9, 4, 2)
  const flick = Math.sin(t * 0.012 + x) * 0.5 + 0.5
  ctx.fillStyle = '#ffaa30'
  ctx.fillRect(x + 8, y + 2, 2, 4)
  ctx.fillStyle = '#ffe070'
  ctx.fillRect(x + 8, y + 2 - Math.round(flick), 2, 2)
  ctx.globalCompositeOperation = 'lighter'
  ctx.fillStyle = 'rgba(255, 200, 100, 0.20)'
  ctx.beginPath()
  ctx.arc(x + 9, y + 4, 10, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalCompositeOperation = 'source-over'
}

function drawIdol(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#3a342a'
  ctx.fillRect(x + 5, y + 2, 6, 14)
  ctx.fillStyle = '#bcae8e'
  ctx.fillRect(x + 6, y + 2, 4, 13)
  ctx.fillStyle = '#5a4a38'
  ctx.fillRect(x + 7, y + 4, 2, 2)
  ctx.fillRect(x + 7, y + 8, 2, 2)
  ctx.fillStyle = '#3a342a'
  ctx.fillRect(x + 4, y + 15, 8, 2)
}

function drawPew(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const w = TILE_PX * 3
  ctx.fillStyle = '#3a2410'
  ctx.fillRect(x, y + 6, w, 8)
  ctx.fillStyle = '#7a5230'
  ctx.fillRect(x + 1, y + 7, w - 2, 4)
  ctx.fillStyle = '#5a3a1e'
  ctx.fillRect(x + 1, y + 11, w - 2, 2)
  ctx.fillStyle = '#3a2410'
  ctx.fillRect(x + 4, y + 13, 3, 4)
  ctx.fillRect(x + w - 7, y + 13, 3, 4)
  ctx.fillStyle = '#9c7448'
  ctx.fillRect(x, y + 4, w, 2)
}

function drawBrazier(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
  ctx.fillStyle = '#3a2a18'
  ctx.fillRect(x + 4, y + 10, 8, 4)
  ctx.fillStyle = '#5a4030'
  ctx.fillRect(x + 5, y + 11, 6, 2)
  ctx.fillStyle = '#1a0a05'
  ctx.fillRect(x + 5, y + 5, 6, 5)
  const flick = (Math.sin(t * 0.014 + x) + 1) / 2
  ctx.fillStyle = '#ff6a20'
  ctx.fillRect(x + 5, y + 4, 6, 5)
  ctx.fillStyle = '#ffaa30'
  ctx.fillRect(x + 6, y + 4 - Math.round(flick), 4, 4)
  ctx.fillStyle = '#ffe070'
  ctx.fillRect(x + 7, y + 5 - Math.round(flick * 2), 2, 2)
  ctx.globalCompositeOperation = 'lighter'
  const glow = ctx.createRadialGradient(x + 8, y + 6, 0, x + 8, y + 6, 32)
  glow.addColorStop(0, 'rgba(255, 180, 80, 0.40)')
  glow.addColorStop(1, 'rgba(255, 140, 50, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(x - 16, y - 16, 48, 48)
  ctx.globalCompositeOperation = 'source-over'
}

export function drawTempleFurniture(
  ctx: CanvasRenderingContext2D,
  f: SceneFixture,
  t: number,
) {
  const x = f.x * TILE_PX
  const y = f.y * TILE_PX
  switch (f.kind) {
    case 'altar':
      drawAltar(ctx, x, y)
      break
    case 'candle':
      drawCandle(ctx, x, y, t)
      break
    case 'idol':
      drawIdol(ctx, x, y)
      break
    case 'pew':
      drawPew(ctx, x, y)
      break
    case 'brazier':
      drawBrazier(ctx, x, y, t)
      break
  }
}
