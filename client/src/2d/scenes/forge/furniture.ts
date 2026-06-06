import type { SceneFixture } from '../../../scenes/core/types'
import { TILE_PX } from '../shared/RoomCanvas'

function drawAnvil(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#2a2218'
  ctx.fillRect(x + 4, y + 8, 16, 4)
  ctx.fillStyle = '#52473c'
  ctx.fillRect(x + 5, y + 4, 14, 6)
  ctx.fillStyle = '#3a322a'
  ctx.fillRect(x + 5, y + 9, 14, 1)
  ctx.fillStyle = '#1a1410'
  ctx.fillRect(x + 9, y + 12, 6, 4)
  ctx.fillStyle = '#7a6a52'
  ctx.fillRect(x + 6, y + 5, 2, 1)
}

function drawForgeFire(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
  ctx.fillStyle = '#2a1810'
  ctx.fillRect(x + 1, y + 2, 14, 14)
  ctx.fillStyle = '#4a2618'
  ctx.fillRect(x + 2, y + 3, 12, 12)
  ctx.fillStyle = '#1a0a05'
  ctx.fillRect(x + 4, y + 6, 8, 7)
  const flick = (Math.sin(t * 0.01) + 1) / 2
  ctx.fillStyle = '#ff4818'
  ctx.fillRect(x + 5, y + 7, 6, 6)
  ctx.fillStyle = '#ffaa30'
  ctx.fillRect(x + 6, y + 8 - Math.round(flick), 4, 5)
  ctx.fillStyle = '#fff080'
  ctx.fillRect(x + 7, y + 9 - Math.round(flick * 2), 2, 3)
  ctx.globalCompositeOperation = 'lighter'
  const glow = ctx.createRadialGradient(x + 8, y + 9, 0, x + 8, y + 9, 48)
  glow.addColorStop(0, 'rgba(255, 160, 60, 0.50)')
  glow.addColorStop(1, 'rgba(255, 140, 50, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(x - 32, y - 32, 80, 80)
  ctx.globalCompositeOperation = 'source-over'
}

function drawToolRack(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#3a2410'
  ctx.fillRect(x + 1, y + 2, 30, 4)
  ctx.fillStyle = '#7a5230'
  ctx.fillRect(x + 1, y + 3, 30, 2)
  ctx.fillStyle = '#9a8a7a'
  ctx.fillRect(x + 3, y + 6, 2, 9)
  ctx.fillRect(x + 9, y + 6, 1, 7)
  ctx.fillRect(x + 15, y + 6, 3, 8)
  ctx.fillRect(x + 22, y + 6, 2, 10)
  ctx.fillStyle = '#3a2418'
  ctx.fillRect(x + 3, y + 13, 2, 3)
  ctx.fillRect(x + 15, y + 12, 3, 3)
  ctx.fillRect(x + 22, y + 14, 2, 3)
}

function drawQuench(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#3a2410'
  ctx.fillRect(x + 2, y + 4, 12, 10)
  ctx.fillStyle = '#5a3a20'
  ctx.fillRect(x + 3, y + 5, 10, 8)
  ctx.fillStyle = '#2a3a52'
  ctx.fillRect(x + 4, y + 6, 8, 5)
  ctx.fillStyle = '#5a7090'
  ctx.fillRect(x + 4, y + 6, 8, 1)
}

function drawOven(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
  ctx.fillStyle = '#2a1810'
  ctx.fillRect(x + 1, y + 2, 14, 14)
  ctx.fillStyle = '#6e3a1c'
  ctx.fillRect(x + 2, y + 3, 12, 12)
  ctx.fillStyle = '#3a1c0a'
  ctx.fillRect(x + 5, y + 7, 6, 5)
  const flick = (Math.sin(t * 0.014) + 1) / 2
  ctx.fillStyle = '#ff7028'
  ctx.fillRect(x + 5, y + 7, 6, 5)
  ctx.fillStyle = '#ffba50'
  ctx.fillRect(x + 6, y + 8 - Math.round(flick), 4, 3)
  ctx.fillStyle = '#3a1c0a'
  ctx.fillRect(x + 3, y + 11, 10, 1)
}

function drawWorkTable(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#3a2410'
  ctx.fillRect(x + 2, y + 4, 28, 14)
  ctx.fillStyle = '#9c7448'
  ctx.fillRect(x + 3, y + 5, 26, 10)
  ctx.fillStyle = '#5a3a1e'
  ctx.fillRect(x + 3, y + 12, 26, 2)
  ctx.fillStyle = '#3a2410'
  ctx.fillRect(x + 5, y + 14, 3, 4)
  ctx.fillRect(x + 24, y + 14, 3, 4)
  ctx.fillStyle = '#e0c890'
  ctx.fillRect(x + 8, y + 7, 6, 4)
  ctx.fillStyle = '#9c7448'
  ctx.fillRect(x + 18, y + 7, 4, 2)
}

function drawSacks(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#3a2410'
  ctx.fillRect(x + 2, y + 6, 12, 10)
  ctx.fillStyle = '#a08868'
  ctx.fillRect(x + 3, y + 7, 4, 8)
  ctx.fillRect(x + 8, y + 5, 4, 9)
  ctx.fillStyle = '#5a4838'
  ctx.fillRect(x + 3, y + 6, 4, 2)
  ctx.fillRect(x + 8, y + 4, 4, 2)
}

function drawMillWheel(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
  const cx = x + 8
  const cy = y + 8
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate((t * 0.0015) % (Math.PI * 2))
  ctx.fillStyle = '#7a5230'
  ctx.beginPath()
  ctx.arc(0, 0, 7, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#3a2418'
  ctx.lineWidth = 1
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(Math.cos(a) * 7, Math.sin(a) * 7)
    ctx.stroke()
  }
  ctx.restore()
  ctx.fillStyle = '#3a2418'
  ctx.beginPath()
  ctx.arc(cx, cy, 1.5, 0, Math.PI * 2)
  ctx.fill()
}

function drawGrindstones(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#3a342a'
  ctx.fillRect(x + 2, y + 4, 28, 12)
  ctx.fillStyle = '#7a7068'
  ctx.fillRect(x + 3, y + 5, 26, 10)
  ctx.fillStyle = '#a09890'
  ctx.beginPath()
  ctx.arc(x + 8, y + 10, 4, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(x + 22, y + 10, 4, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#3a342a'
  ctx.beginPath()
  ctx.arc(x + 8, y + 10, 1, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(x + 22, y + 10, 1, 0, Math.PI * 2)
  ctx.fill()
}

export function drawShopFurniture(ctx: CanvasRenderingContext2D, f: SceneFixture, t: number) {
  const x = f.x * TILE_PX
  const y = f.y * TILE_PX
  switch (f.kind) {
    case 'anvil':
      drawAnvil(ctx, x, y)
      break
    case 'forge_fire':
      drawForgeFire(ctx, x, y, t)
      break
    case 'tool_rack':
      drawToolRack(ctx, x, y)
      break
    case 'quench':
      drawQuench(ctx, x, y)
      break
    case 'oven':
      drawOven(ctx, x, y, t)
      break
    case 'work_table':
      drawWorkTable(ctx, x, y)
      break
    case 'sacks':
      drawSacks(ctx, x, y)
      break
    case 'mill_wheel':
      drawMillWheel(ctx, x, y, t)
      break
    case 'grindstones':
      drawGrindstones(ctx, x, y)
      break
  }
}
