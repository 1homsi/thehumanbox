import type { SceneFixture } from '../../../scenes/core/types'
import { TILE_PX } from '../shared/RoomCanvas'

function drawSquareFire(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
  ctx.fillStyle = '#2a1810'
  ctx.beginPath()
  ctx.arc(x + 8, y + 9, 8, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#1a0a05'
  ctx.beginPath()
  ctx.arc(x + 8, y + 9, 5, 0, Math.PI * 2)
  ctx.fill()
  const flick = (Math.sin(t * 0.011) + 1) / 2
  ctx.fillStyle = '#ff5a18'
  ctx.beginPath()
  ctx.arc(x + 8, y + 9, 4, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#ffaa30'
  ctx.beginPath()
  ctx.arc(x + 8, y + 8 - Math.round(flick), 2.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalCompositeOperation = 'lighter'
  const glow = ctx.createRadialGradient(x + 8, y + 9, 0, x + 8, y + 9, 56)
  glow.addColorStop(0, 'rgba(255, 170, 70, 0.45)')
  glow.addColorStop(1, 'rgba(255, 140, 50, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(x - 40, y - 40, 96, 96)
  ctx.globalCompositeOperation = 'source-over'
}

function drawWell(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#3a342a'
  ctx.fillRect(x + 2, y + 6, 12, 10)
  ctx.fillStyle = '#7a7068'
  ctx.fillRect(x + 3, y + 7, 10, 8)
  ctx.fillStyle = '#1a3a52'
  ctx.beginPath()
  ctx.arc(x + 8, y + 11, 4, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#3a2410'
  ctx.fillRect(x + 4, y + 2, 1, 5)
  ctx.fillRect(x + 11, y + 2, 1, 5)
  ctx.fillRect(x + 4, y + 2, 8, 1)
}

function drawCart(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#3a2410'
  ctx.fillRect(x + 2, y + 4, 28, 10)
  ctx.fillStyle = '#7a5230'
  ctx.fillRect(x + 3, y + 5, 26, 8)
  ctx.fillStyle = '#5a3a1e'
  ctx.fillRect(x + 4, y + 10, 24, 1)
  ctx.fillStyle = '#1a1410'
  ctx.beginPath()
  ctx.arc(x + 8, y + 14, 3, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(x + 24, y + 14, 3, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#6e5238'
  ctx.fillRect(x + 8, y + 7, 4, 3)
  ctx.fillRect(x + 18, y + 7, 4, 3)
}

function drawStall(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#3a2410'
  ctx.fillRect(x + 2, y + 6, 12, 10)
  ctx.fillStyle = '#7a5230'
  ctx.fillRect(x + 3, y + 7, 10, 8)
  ctx.fillStyle = '#a04848'
  ctx.fillRect(x + 1, y + 4, 14, 3)
  ctx.fillStyle = '#5a2818'
  ctx.fillRect(x + 1, y + 4, 14, 1)
  ctx.fillStyle = '#d8b270'
  ctx.fillRect(x + 4, y + 10, 3, 2)
  ctx.fillStyle = '#9a6a3a'
  ctx.fillRect(x + 9, y + 10, 3, 2)
}

function drawSmallHut(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#3a2410'
  ctx.fillRect(x + 1, y + 8, 14, 8)
  ctx.fillStyle = '#7a5230'
  ctx.fillRect(x + 2, y + 9, 12, 6)
  ctx.fillStyle = '#5a2818'
  ctx.beginPath()
  ctx.moveTo(x + 1, y + 8)
  ctx.lineTo(x + 8, y + 2)
  ctx.lineTo(x + 15, y + 8)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#3a1a08'
  ctx.fillRect(x + 6, y + 12, 4, 4)
  ctx.fillStyle = '#d8b270'
  ctx.fillRect(x + 8, y + 14, 1, 1)
}

export function drawSettlementFurniture(
  ctx: CanvasRenderingContext2D,
  f: SceneFixture,
  t: number,
) {
  const x = f.x * TILE_PX
  const y = f.y * TILE_PX
  switch (f.kind) {
    case 'square_fire':
      drawSquareFire(ctx, x, y, t)
      break
    case 'well':
      drawWell(ctx, x, y)
      break
    case 'cart':
      drawCart(ctx, x, y)
      break
    case 'stall':
      drawStall(ctx, x, y)
      break
    case 'small_hut':
      drawSmallHut(ctx, x, y)
      break
  }
}
