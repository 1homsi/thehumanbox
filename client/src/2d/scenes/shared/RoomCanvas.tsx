import { useEffect, useRef } from 'react'
import { ATLAS_TOWN, onAnyAtlasLoaded, drawPeopleTile, pickHumanSprite } from '../../../utils/sprites'
import type { SceneContext, SceneFixture } from '../../../scenes/core/types'
import { deterministicAppearanceIndex, resolveAgeStage } from '../../world/character-visuals'

export const TILE_PX = 16
export const SCALE = 3
export const ROOM_COLS = 14
export const ROOM_ROWS = 10
export const CANVAS_W = ROOM_COLS * TILE_PX
export const CANVAS_H = ROOM_ROWS * TILE_PX

export interface RoomPalette {
  wall: string
  wallShade: string
  wallHighlight: string
  floor: string
  floorPlank: string
  floorShade: string
  outside: string
}

export type FurnitureDrawer = (ctx: CanvasRenderingContext2D, fixture: SceneFixture, time: number) => void

interface Props {
  ctx: SceneContext
  palette: RoomPalette
  drawFurniture: FurnitureDrawer
  occupantSlots: (n: number) => Array<[number, number]>
  selectedOrgId: string | null
  onSelectOrg: (id: string) => void
  hover: number
}

function drawFloor(ctx: CanvasRenderingContext2D, p: RoomPalette) {
  for (let r = 1; r < ROOM_ROWS - 1; r++) {
    for (let c = 1; c < ROOM_COLS - 1; c++) {
      const x = c * TILE_PX
      const y = r * TILE_PX
      ctx.fillStyle = (r + c) % 2 === 0 ? p.floor : p.floorPlank
      ctx.fillRect(x, y, TILE_PX, TILE_PX)
      ctx.fillStyle = p.floorShade
      ctx.fillRect(x, y + TILE_PX - 1, TILE_PX, 1)
    }
  }
}

function drawWalls(ctx: CanvasRenderingContext2D, p: RoomPalette) {
  ctx.fillStyle = p.wall
  ctx.fillRect(0, 0, CANVAS_W, TILE_PX)
  ctx.fillRect(0, CANVAS_H - TILE_PX, CANVAS_W, TILE_PX)
  ctx.fillRect(0, 0, TILE_PX, CANVAS_H)
  ctx.fillRect(CANVAS_W - TILE_PX, 0, TILE_PX, CANVAS_H)

  ctx.fillStyle = p.wallShade
  ctx.fillRect(0, TILE_PX - 2, CANVAS_W, 2)
  ctx.fillRect(0, CANVAS_H - TILE_PX, CANVAS_W, 2)
  ctx.fillRect(TILE_PX - 2, 0, 2, CANVAS_H)
  ctx.fillRect(CANVAS_W - TILE_PX, 0, 2, CANVAS_H)

  ctx.fillStyle = p.wallHighlight
  for (let c = 0; c < ROOM_COLS; c++) {
    ctx.fillRect(c * TILE_PX, 0, TILE_PX - 2, 2)
    ctx.fillRect(c * TILE_PX, CANVAS_H - 2, TILE_PX - 2, 2)
  }

  const doorX = Math.floor(ROOM_COLS / 2) - 1
  ctx.fillStyle = p.floorShade
  ctx.fillRect(doorX * TILE_PX, CANVAS_H - TILE_PX, TILE_PX * 2, TILE_PX)
  ctx.fillStyle = p.floor
  ctx.fillRect(doorX * TILE_PX + 2, CANVAS_H - TILE_PX + 2, TILE_PX * 2 - 4, TILE_PX - 4)
  ctx.fillStyle = p.wallShade
  ctx.fillRect(doorX * TILE_PX + 1, CANVAS_H - 2, TILE_PX * 2 - 2, 2)
}

function drawHostRing(ctx: CanvasRenderingContext2D, cx: number, cy: number, t: number) {
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

function drawAmbient(ctx: CanvasRenderingContext2D, isDay: boolean) {
  if (isDay) return
  ctx.globalCompositeOperation = 'multiply'
  ctx.fillStyle = 'rgba(40, 32, 50, 0.55)'
  ctx.fillRect(TILE_PX, TILE_PX, CANVAS_W - TILE_PX * 2, CANVAS_H - TILE_PX * 2)
  ctx.globalCompositeOperation = 'source-over'
}

export function RoomCanvas({
  ctx: sceneCtx,
  palette,
  drawFurniture,
  occupantSlots,
  selectedOrgId,
  onSelectOrg,
  hover,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const hitRef = useRef<Array<{ id: string; x: number; y: number; r: number }>>([])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const c = canvas.getContext('2d')
    if (!c) return
    c.imageSmoothingEnabled = false

    const fixtures = sceneCtx.fixtures
    const slots = occupantSlots(sceneCtx.occupants.length)

    const paint = (time: number) => {
      c.fillStyle = palette.outside
      c.fillRect(0, 0, CANVAS_W, CANVAS_H)
      drawFloor(c, palette)
      for (const f of fixtures) drawFurniture(c, f, time)
      drawWalls(c, palette)

      hitRef.current = []
      sceneCtx.occupants.forEach((occ, i) => {
        const [cx, cy] = slots[i] ?? [7, 5]
        const px = cx * TILE_PX
        const py = cy * TILE_PX
        const sex = (occ.org.sex ?? 'male') as 'male' | 'female'
        const sprite = pickHumanSprite(
          sex,
          resolveAgeStage(occ.org),
          0,
          deterministicAppearanceIndex(occ.org.id),
        )
        const size = 32
        const dx = px - size / 2
        const dy = py - 16

        c.fillStyle = 'rgba(0,0,0,0.45)'
        c.beginPath()
        c.ellipse(px, py + 11, 8, 3, 0, 0, Math.PI * 2)
        c.fill()

        if (occ.org.id === selectedOrgId) {
          drawHostRing(c, px, py - 2, time)
        }

        drawPeopleTile(c, sprite, dx, dy, size)

        hitRef.current.push({ id: occ.org.id, x: px, y: py - 2, r: 12 })

        c.font = '6px monospace'
        c.textAlign = 'center'
        c.textBaseline = 'top'
        c.fillStyle = 'rgba(0,0,0,0.55)'
        c.fillRect(px - occ.org.name.length * 2, py + 14, occ.org.name.length * 4 + 2, 7)
        c.fillStyle = '#f0eada'
        c.fillText(occ.org.name, px, py + 15)
      })

      drawAmbient(c, sceneCtx.isDay)

      rafRef.current = requestAnimationFrame(paint)
    }
    rafRef.current = requestAnimationFrame(paint)

    return () => cancelAnimationFrame(rafRef.current)
  }, [sceneCtx, palette, drawFurniture, occupantSlots, selectedOrgId, hover])

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const sx = ((e.clientX - rect.left) / rect.width) * CANVAS_W
    const sy = ((e.clientY - rect.top) / rect.height) * CANVAS_H
    for (const h of hitRef.current) {
      if ((sx - h.x) ** 2 + (sy - h.y) ** 2 < h.r * h.r) {
        onSelectOrg(h.id)
        return
      }
    }
  }

  useEffect(() => {
    onAnyAtlasLoaded(() => {
      /* trigger re-paint via raf */
    })
  }, [])
  void ATLAS_TOWN

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_W}
      height={CANVAS_H}
      onClick={onClick}
      style={{
        imageRendering: 'pixelated',
        width: `${CANVAS_W * SCALE}px`,
        height: `${CANVAS_H * SCALE}px`,
        cursor: 'pointer',
        display: 'block',
        margin: '0 auto',
      }}
    />
  )
}
