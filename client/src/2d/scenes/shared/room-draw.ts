import type { SceneFixture } from '../../../scenes/core/types'
import { ROOM_COLS, ROOM_ROWS, TILE_PX } from './room-constants'

/** Fixture kinds that emit warm light and should punch through the night dim. */
const FIRE_FIXTURE_KINDS = new Set([
  'fireplace',
  'brazier',
  'candle',
  'square_fire',
  'forge_fire',
  'oven',
  'hearth',
  'campfire',
])

/** Columns (in tiles) where wall torch sconces hang. */
export const SCONCE_COLS = [3, ROOM_COLS - 4]

export function drawSconce(ctx: CanvasRenderingContext2D, cx: number, t: number) {
  const flick = Math.sin(t * 0.011 + cx * 1.7) * 0.5 + 0.5
  // bracket + stick
  ctx.fillStyle = '#2a2018'
  ctx.fillRect(cx - 2, 9, 4, 4)
  ctx.fillStyle = '#5a3a20'
  ctx.fillRect(cx - 1, 5, 2, 5)
  // flame
  ctx.fillStyle = '#ff6a20'
  ctx.fillRect(cx - 2, 2 + Math.round(flick), 4, 4)
  ctx.fillStyle = '#ffaa30'
  ctx.fillRect(cx - 1, 1 + Math.round(flick * 1.5), 2, 3)
  ctx.fillStyle = '#ffe070'
  ctx.fillRect(cx - 1, 3, 1, 1)
}

export function drawHostRing(ctx: CanvasRenderingContext2D, cx: number, cy: number, t: number) {
  ctx.save()
  const pulse = (Math.sin(t * 0.005) + 1) / 2
  ctx.strokeStyle = `rgba(255, 224, 102, ${0.5 + pulse * 0.4})`
  ctx.lineWidth = 1.5
  ctx.setLineDash([3, 2])
  ctx.lineDashOffset = -t * 0.02
  ctx.beginPath()
  ctx.arc(cx, cy, 14, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

export function drawHoverRing(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  ctx.save()
  ctx.strokeStyle = 'rgba(240, 234, 218, 0.55)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(cx, cy, 15, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

/** Feet in the people atlas land at cell y≈30, so the shadow sits at py+13. */
export function drawOccupantShadow(ctx: CanvasRenderingContext2D, px: number, py: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.45)'
  ctx.beginPath()
  ctx.ellipse(px, py + 13, 8, 3, 0, 0, Math.PI * 2)
  ctx.fill()
}

export function drawNamePlate(
  ctx: CanvasRenderingContext2D,
  name: string,
  px: number,
  py: number,
  emphasized: boolean,
) {
  ctx.font = '7px monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  const tw = ctx.measureText(name).width
  const bx = px - tw / 2 - 2
  const by = py + 16
  ctx.fillStyle = 'rgba(10, 8, 6, 0.78)'
  ctx.fillRect(bx, by, tw + 4, 9)
  if (emphasized) {
    ctx.strokeStyle = 'rgba(216, 178, 112, 0.55)'
    ctx.lineWidth = 1
    ctx.strokeRect(bx + 0.5, by + 0.5, tw + 3, 8)
  }
  ctx.fillStyle = emphasized ? '#ffe9b8' : '#f0eada'
  ctx.fillText(name, px, by + 1)
}

interface LightSource {
  cx: number
  cy: number
  radius: number
}

export function collectNightLights(fixtures: SceneFixture[]): LightSource[] {
  const lights: LightSource[] = []
  for (const f of fixtures) {
    if (!FIRE_FIXTURE_KINDS.has(f.kind)) continue
    lights.push({
      cx: f.x * TILE_PX + TILE_PX / 2,
      cy: f.y * TILE_PX + TILE_PX / 2,
      radius: f.kind === 'candle' ? 24 : f.kind === 'oven' ? 36 : 50,
    })
  }
  for (const col of SCONCE_COLS) {
    lights.push({ cx: col * TILE_PX + TILE_PX / 2, cy: 6, radius: 18 })
  }
  return lights
}

/** Warm light pools drawn after the night dim so fires visibly light the room. */
export function drawNightLights(ctx: CanvasRenderingContext2D, lights: LightSource[]) {
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (const l of lights) {
    const g = ctx.createRadialGradient(l.cx, l.cy, 0, l.cx, l.cy, l.radius)
    g.addColorStop(0, 'rgba(255, 176, 84, 0.32)')
    g.addColorStop(0.55, 'rgba(255, 140, 50, 0.13)')
    g.addColorStop(1, 'rgba(255, 140, 50, 0)')
    ctx.fillStyle = g
    ctx.fillRect(l.cx - l.radius, l.cy - l.radius, l.radius * 2, l.radius * 2)
  }
  ctx.restore()
}

export function drawRoomFloor(
  ctx: CanvasRenderingContext2D,
  palette: { floor: string; floorPlank: string; floorShade: string },
) {
  for (let row = 1; row < ROOM_ROWS - 1; row++) {
    for (let col = 1; col < ROOM_COLS - 1; col++) {
      const x = col * TILE_PX
      const y = row * TILE_PX
      ctx.fillStyle = (row + col) % 3 === 0 ? palette.floorPlank : palette.floor
      ctx.fillRect(x, y, TILE_PX, TILE_PX)
      ctx.fillStyle = palette.floorShade
      ctx.fillRect(x, y + TILE_PX - 1, TILE_PX, 1)
      // Alternate joints so the floor reads as boards rather than a checkerboard.
      if ((col + row) % 2 === 0) ctx.fillRect(x, y, 1, TILE_PX)
      ctx.fillStyle = 'rgba(255, 230, 183, 0.07)'
      ctx.fillRect(x + 2, y + 2, TILE_PX - 4, 1)
      ctx.fillStyle = 'rgba(25, 16, 12, 0.12)'
      ctx.fillRect(x + 3 + (row % 3), y + 8, 5, 1)
    }
  }
  // Contact shading tucks the floor underneath the room walls.
  ctx.fillStyle = 'rgba(20, 14, 12, 0.22)'
  ctx.fillRect(TILE_PX, TILE_PX, (ROOM_COLS - 2) * TILE_PX, 3)
  ctx.fillRect(TILE_PX, TILE_PX, 2, (ROOM_ROWS - 2) * TILE_PX)
}
