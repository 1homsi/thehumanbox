import { useEffect, useRef } from 'react'
import { drawPeopleTile, pickHumanSprite } from '../../../utils/sprites'
import type { SceneContext, SceneFixture } from '../../../scenes/core/types'
import { deterministicAppearanceIndex, resolveAgeStage } from '../../world/character-visuals'
import {
  collectNightLights,
  drawRoomFloor,
  drawHostRing,
  drawHoverRing,
  drawNamePlate,
  drawNightLights,
  drawOccupantShadow,
  drawSconce,
  SCONCE_COLS,
} from './room-draw'
import { TILE_PX, SCALE, ROOM_COLS, ROOM_ROWS, CANVAS_W, CANVAS_H } from './room-constants'

export { TILE_PX, SCALE, ROOM_COLS, ROOM_ROWS, CANVAS_W, CANVAS_H }

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
}

function drawWalls(ctx: CanvasRenderingContext2D, p: RoomPalette, t: number) {
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

  for (const col of SCONCE_COLS) drawSconce(ctx, col * TILE_PX + TILE_PX / 2, t)

  const doorX = Math.floor(ROOM_COLS / 2) - 1
  ctx.fillStyle = p.floorShade
  ctx.fillRect(doorX * TILE_PX, CANVAS_H - TILE_PX, TILE_PX * 2, TILE_PX)
  ctx.fillStyle = p.floor
  ctx.fillRect(doorX * TILE_PX + 2, CANVAS_H - TILE_PX + 2, TILE_PX * 2 - 4, TILE_PX - 4)
  ctx.fillStyle = p.wallShade
  ctx.fillRect(doorX * TILE_PX + 1, CANVAS_H - 2, TILE_PX * 2 - 2, 2)
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
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const hitRef = useRef<Array<{ id: string; x: number; y: number; r: number }>>([])
  const hoveredRef = useRef<string | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const c = canvas.getContext('2d')
    if (!c) return
    c.imageSmoothingEnabled = false

    const fixtures = [...sceneCtx.fixtures].sort((a, b) => a.y - b.y || a.x - b.x)
    const slots = occupantSlots(sceneCtx.occupants.length)
    const nightLights = collectNightLights(fixtures)

    const paint = (time: number) => {
      c.fillStyle = palette.outside
      c.fillRect(0, 0, CANVAS_W, CANVAS_H)
      drawRoomFloor(c, palette)
      for (const f of fixtures) drawFurniture(c, f, time)
      drawWalls(c, palette, time)

      const hoveredId = hoveredRef.current
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
        // Two-frame idle breath, phase-shifted per occupant so a full
        // room doesn't bob in unison.
        const bob = Math.sin(time * 0.0035 + i * 1.7) > 0 ? 0 : -1
        const dx = px - size / 2
        const dy = py - 16 + bob
        const isSelected = occ.org.id === selectedOrgId
        const isHovered = occ.org.id === hoveredId

        drawOccupantShadow(c, px, py)

        if (isHovered && !isSelected) {
          drawHoverRing(c, px, py - 2)
        }
        if (isSelected) {
          drawHostRing(c, px, py - 2, time)
        }

        drawPeopleTile(c, sprite, dx, dy, size)

        hitRef.current.push({ id: occ.org.id, x: px, y: py - 2, r: 14 })

        drawNamePlate(c, occ.org.name, px, py, isHovered || isSelected)
      })

      drawAmbient(c, sceneCtx.isDay)
      if (!sceneCtx.isDay) drawNightLights(c, nightLights)

      rafRef.current = requestAnimationFrame(paint)
    }
    rafRef.current = requestAnimationFrame(paint)

    return () => cancelAnimationFrame(rafRef.current)
  }, [sceneCtx, palette, drawFurniture, occupantSlots, selectedOrgId])

  const hitTest = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas || hitRef.current.length === 0) return null
    const rect = canvas.getBoundingClientRect()
    const sx = ((e.clientX - rect.left) / rect.width) * CANVAS_W
    const sy = ((e.clientY - rect.top) / rect.height) * CANVAS_H
    for (const h of hitRef.current) {
      if ((sx - h.x) ** 2 + (sy - h.y) ** 2 < h.r * h.r) return h.id
    }
    return null
  }

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const id = hitTest(e)
    if (id) onSelectOrg(id)
  }

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const id = hitTest(e)
    hoveredRef.current = id
    const canvas = canvasRef.current
    if (canvas) canvas.style.cursor = id ? 'pointer' : 'default'
  }

  const onMouseLeave = () => {
    hoveredRef.current = null
    const canvas = canvasRef.current
    if (canvas) canvas.style.cursor = 'default'
  }

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_W}
      height={CANVAS_H}
      onClick={onClick}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      style={{
        imageRendering: 'pixelated',
        width: `${CANVAS_W * SCALE}px`,
        maxWidth: '100%',
        height: 'auto',
        aspectRatio: `${CANVAS_W} / ${CANVAS_H}`,
        display: 'block',
        margin: '0 auto',
      }}
    />
  )
}
