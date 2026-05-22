import type { SceneFixture } from '../../../scenes/core/types'
import { TILE_PX } from '../shared/RoomCanvas'

function drawFireplace(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
  ctx.fillStyle = '#2a1a10'
  ctx.fillRect(x, y, 32, 32)
  ctx.fillStyle = '#4a2e1c'
  ctx.fillRect(x + 2, y + 2, 28, 4)
  ctx.fillRect(x + 2, y + 26, 28, 4)
  ctx.fillStyle = '#1a0a05'
  ctx.fillRect(x + 6, y + 8, 20, 18)
  const flick = (Math.sin(t * 0.008) + 1) / 2
  ctx.fillStyle = '#ff6a20'
  ctx.fillRect(x + 8, y + 12, 16, 12)
  ctx.fillStyle = '#ffaa30'
  ctx.fillRect(x + 10, y + 14 - Math.round(flick), 12, 9)
  ctx.fillStyle = '#ffe070'
  ctx.fillRect(x + 13, y + 16 - Math.round(flick * 2), 6, 5)
  ctx.globalCompositeOperation = 'lighter'
  const glow = ctx.createRadialGradient(x + 16, y + 18, 0, x + 16, y + 18, 56)
  glow.addColorStop(0, 'rgba(255, 180, 80, 0.45)')
  glow.addColorStop(1, 'rgba(255, 140, 50, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(x - 32, y - 32, 96, 96)
  ctx.globalCompositeOperation = 'source-over'
}

function drawBar(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#2a1810'
  ctx.fillRect(x, y, TILE_PX * 4, TILE_PX * 2)
  ctx.fillStyle = '#7a4e26'
  ctx.fillRect(x + 1, y + 1, TILE_PX * 4 - 2, TILE_PX * 2 - 4)
  ctx.fillStyle = '#4a2e18'
  ctx.fillRect(x + 1, y + TILE_PX, TILE_PX * 4 - 2, 2)
  ctx.fillStyle = '#5a3a20'
  ctx.fillRect(x + 1, y + TILE_PX * 2 - 4, TILE_PX * 4 - 2, 3)
  ctx.fillStyle = '#3a2a18'
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(x + 4 + i * 14, y + 4, 6, 4)
  }
}

function drawBarrel(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#3a2410'
  ctx.fillRect(x + 1, y + 1, TILE_PX - 2, TILE_PX - 2)
  ctx.fillStyle = '#7a4e26'
  ctx.fillRect(x + 2, y + 2, TILE_PX - 4, TILE_PX - 4)
  ctx.fillStyle = '#3a2410'
  ctx.fillRect(x + 2, y + 5, TILE_PX - 4, 1)
  ctx.fillRect(x + 2, y + 10, TILE_PX - 4, 1)
  ctx.fillStyle = '#5a3a20'
  ctx.fillRect(x + 5, y + 2, 1, TILE_PX - 4)
  ctx.fillRect(x + 10, y + 2, 1, TILE_PX - 4)
}

function drawLongTable(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const w = TILE_PX * 6
  const h = TILE_PX * 2
  ctx.fillStyle = '#3a2410'
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = '#9c7448'
  ctx.fillRect(x + 1, y + 2, w - 2, h - 6)
  ctx.fillStyle = '#5a3a1e'
  ctx.fillRect(x + 1, y + h - 8, w - 2, 2)
  ctx.fillStyle = '#3a2410'
  ctx.fillRect(x + 4, y + h - 4, 3, 4)
  ctx.fillRect(x + w - 7, y + h - 4, 3, 4)
  ctx.fillStyle = '#d8b270'
  ctx.fillRect(x + 8, y + 6, 4, 3)
  ctx.fillStyle = '#aa7a3a'
  ctx.fillRect(x + 24, y + 6, 4, 3)
  ctx.fillStyle = '#d8b270'
  ctx.fillRect(x + 48, y + 6, 4, 3)
  ctx.fillStyle = '#7a4a20'
  ctx.fillRect(x + 16, y + 7, 3, 3)
  ctx.fillRect(x + 36, y + 7, 3, 3)
}

function drawStool(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#3a2410'
  ctx.fillRect(x + 4, y + 5, 8, 8)
  ctx.fillStyle = '#7a5230'
  ctx.fillRect(x + 5, y + 6, 6, 4)
  ctx.fillStyle = '#3a2410'
  ctx.fillRect(x + 5, y + 11, 2, 4)
  ctx.fillRect(x + 9, y + 11, 2, 4)
}

export function drawTavernFurniture(
  ctx: CanvasRenderingContext2D,
  f: SceneFixture,
  t: number,
) {
  const x = f.x * TILE_PX
  const y = f.y * TILE_PX
  switch (f.kind) {
    case 'fireplace':
      drawFireplace(ctx, x, y, t)
      break
    case 'bar':
      drawBar(ctx, x, y)
      break
    case 'barrel':
      drawBarrel(ctx, x, y)
      break
    case 'long_table':
      drawLongTable(ctx, x, y)
      break
    case 'stool':
      drawStool(ctx, x, y)
      break
  }
}
