import { useEffect, useRef } from 'react'
import {
  ATLAS_TOWN,
  onAnyAtlasLoaded,
  drawPeopleTile,
  pickHumanSprite,
  type AgeStage,
} from '../../../utils/sprites'
import type { SceneContext, SceneOccupant } from '../../../scenes/core/types'

const TILE_PX = 16
const SCALE = 3
const ROOM_COLS = 14
const ROOM_ROWS = 10
const CANVAS_W = ROOM_COLS * TILE_PX
const CANVAS_H = ROOM_ROWS * TILE_PX

const ERA_PALETTE: Record<
  string,
  {
    wall: string
    wallShade: string
    wallHighlight: string
    floor: string
    floorPlank: string
    floorShade: string
    outside: string
  }
> = {
  'pre-stone': {
    wall: '#5a4a2c',
    wallShade: '#3a2e18',
    wallHighlight: '#7a6244',
    floor: '#6b5028',
    floorPlank: '#574020',
    floorShade: '#3e2e16',
    outside: '#2d2014',
  },
  stone: {
    wall: '#7a7068',
    wallShade: '#54493e',
    wallHighlight: '#9a8e83',
    floor: '#76553a',
    floorPlank: '#5e4128',
    floorShade: '#3e2c18',
    outside: '#2a2218',
  },
  bronze: {
    wall: '#8e6a3a',
    wallShade: '#5e4520',
    wallHighlight: '#b58850',
    floor: '#8c6332',
    floorPlank: '#704c20',
    floorShade: '#4a3214',
    outside: '#1f1812',
  },
  iron: {
    wall: '#937048',
    wallShade: '#5e4626',
    wallHighlight: '#b68b5e',
    floor: '#956a3a',
    floorPlank: '#74522c',
    floorShade: '#4a3018',
    outside: '#1c1610',
  },
  classical: {
    wall: '#b89870',
    wallShade: '#806340',
    wallHighlight: '#d6b88b',
    floor: '#a87844',
    floorPlank: '#825a2e',
    floorShade: '#523618',
    outside: '#1a1410',
  },
  medieval: {
    wall: '#7c5a36',
    wallShade: '#523a20',
    wallHighlight: '#a07a4e',
    floor: '#8e6238',
    floorPlank: '#6e4a25',
    floorShade: '#46301a',
    outside: '#181210',
  },
  renaissance: {
    wall: '#a88f6e',
    wallShade: '#705c43',
    wallHighlight: '#c8ad88',
    floor: '#a07254',
    floorPlank: '#7d5638',
    floorShade: '#4f3220',
    outside: '#15110d',
  },
  industrial: {
    wall: '#7a5c44',
    wallShade: '#503a26',
    wallHighlight: '#9a7858',
    floor: '#5a4434',
    floorPlank: '#3e2e22',
    floorShade: '#251a14',
    outside: '#12100d',
  },
  modern: {
    wall: '#b6a08a',
    wallShade: '#7a6857',
    wallHighlight: '#cdbaa3',
    floor: '#7e6c5a',
    floorPlank: '#5c4d3e',
    floorShade: '#3a3127',
    outside: '#0f0d0a',
  },
  information: {
    wall: '#bdb6aa',
    wallShade: '#80796d',
    wallHighlight: '#d4cdc0',
    floor: '#8a8275',
    floorPlank: '#5c574d',
    floorShade: '#3a352d',
    outside: '#0d0c0a',
  },
}

interface FurnSlot {
  x: number
  y: number
  w: number
  h: number
  kind: string
}

function fixturesLayout(era: string): FurnSlot[] {
  const list: FurnSlot[] = []
  list.push({ x: 2, y: ROOM_ROWS - 3, w: 2, h: 2, kind: 'hearth' })
  list.push({ x: 5, y: 2, w: 3, h: 1, kind: 'mat' })
  list.push({ x: ROOM_COLS - 4, y: 2, w: 2, h: 2, kind: 'storage' })
  if (era !== 'pre-stone' && era !== 'stone') {
    list.push({ x: 9, y: ROOM_ROWS - 3, w: 3, h: 1, kind: 'bench' })
  }
  if (era !== 'pre-stone' && era !== 'stone' && era !== 'bronze' && era !== 'iron') {
    list.push({ x: 5, y: ROOM_ROWS - 4, w: 3, h: 2, kind: 'table' })
  }
  if (era === 'renaissance' || era === 'industrial' || era === 'modern' || era === 'information') {
    list.push({ x: 2, y: 2, w: 2, h: 2, kind: 'shelf' })
  }
  return list
}

interface Props {
  ctx: SceneContext
  selectedOrgId: string | null
  onSelectOrg: (id: string) => void
  hover: number
}

function eraOf(world: SceneContext['world'], lid: string): string {
  const raw = world.lineage_eras
  if (Array.isArray(raw)) return raw.find((e) => e.lineage_id === lid)?.era_name ?? 'pre-stone'
  return (raw as Record<string, string> | undefined)?.[lid] ?? 'pre-stone'
}

function deriveStage(o: SceneOccupant['org']): AgeStage {
  const declared = o.age_stage as AgeStage | undefined
  if (declared === 'infant' || declared === 'child' || declared === 'teen' || declared === 'adult')
    return declared
  if (declared === 'elder') return 'adult'
  if (o.is_elder) return 'adult'
  if (o.age < 220) return 'infant'
  if (o.age < 900) return 'child'
  if (o.age < 1800) return 'teen'
  return 'adult'
}

function occupantSlots(n: number): Array<[number, number]> {
  if (n === 0) return []
  if (n === 1) return [[7, 5]]
  if (n === 2)
    return [
      [5, 5],
      [9, 5],
    ]
  if (n === 3)
    return [
      [4, 5],
      [7, 6],
      [10, 5],
    ]
  if (n === 4)
    return [
      [4, 5],
      [6, 6],
      [9, 6],
      [11, 5],
    ]
  const out: Array<[number, number]> = []
  for (let i = 0; i < n; i++) {
    const col = i % 5
    const row = Math.floor(i / 5)
    out.push([3 + col * 2, 5 + row * 2])
  }
  return out
}

function drawFloor(ctx: CanvasRenderingContext2D, p: (typeof ERA_PALETTE)[string]) {
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

function drawWalls(ctx: CanvasRenderingContext2D, p: (typeof ERA_PALETTE)[string]) {
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

function drawHearth(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
  ctx.fillStyle = '#1a0a05'
  ctx.fillRect(x + 2, y + 6, 28, 22)
  ctx.fillStyle = '#3a1e10'
  ctx.fillRect(x + 4, y + 4, 24, 4)
  ctx.fillStyle = '#5a3018'
  ctx.fillRect(x + 4, y + 26, 24, 4)

  ctx.fillStyle = '#2a1408'
  ctx.fillRect(x + 8, y + 14, 16, 12)

  const flick = (Math.sin(t * 0.008) + 1) / 2
  ctx.fillStyle = '#ff6a20'
  ctx.fillRect(x + 10, y + 16, 12, 9)
  ctx.fillStyle = '#ffaa30'
  ctx.fillRect(x + 12, y + 17 - Math.round(flick * 1), 8, 6)
  ctx.fillStyle = '#ffe070'
  ctx.fillRect(x + 14, y + 19 - Math.round(flick * 2), 4, 3)

  ctx.globalCompositeOperation = 'lighter'
  const glow = ctx.createRadialGradient(x + 16, y + 18, 0, x + 16, y + 18, 48)
  glow.addColorStop(0, 'rgba(255, 180, 80, 0.45)')
  glow.addColorStop(0.5, 'rgba(255, 140, 50, 0.20)')
  glow.addColorStop(1, 'rgba(255, 140, 50, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(x - 32, y - 32, 96, 96)
  ctx.globalCompositeOperation = 'source-over'
}

function drawMat(ctx: CanvasRenderingContext2D, x: number, y: number, w: number) {
  ctx.fillStyle = '#3a2818'
  ctx.fillRect(x, y + 2, w, 12)
  ctx.fillStyle = '#7a5a3a'
  ctx.fillRect(x + 1, y + 3, w - 2, 10)
  for (let i = 0; i < w / 4; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#5a3e22' : '#8c6a44'
    ctx.fillRect(x + 2 + i * 4, y + 3, 2, 10)
  }
  ctx.fillStyle = '#e0c890'
  ctx.fillRect(x + 4, y + 4, 6, 4)
}

function drawStorage(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#3a2410'
  ctx.fillRect(x + 2, y + 4, 28, 28)
  ctx.fillStyle = '#5e3e1c'
  ctx.fillRect(x + 4, y + 6, 24, 24)
  ctx.fillStyle = '#3a2410'
  ctx.fillRect(x + 4, y + 6, 24, 3)
  ctx.fillStyle = '#8a6230'
  ctx.fillRect(x + 6, y + 12, 4, 12)
  ctx.fillRect(x + 22, y + 12, 4, 12)
  ctx.fillStyle = '#d8b270'
  ctx.fillRect(x + 14, y + 18, 4, 2)
}

function drawBench(ctx: CanvasRenderingContext2D, x: number, y: number, w: number) {
  ctx.fillStyle = '#3a2410'
  ctx.fillRect(x, y + 4, w, 8)
  ctx.fillStyle = '#7a5a3a'
  ctx.fillRect(x + 1, y + 5, w - 2, 4)
  ctx.fillStyle = '#3a2410'
  ctx.fillRect(x + 2, y + 12, 3, 4)
  ctx.fillRect(x + w - 5, y + 12, 3, 4)
}

function drawTable(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = '#3a2410'
  ctx.fillRect(x, y + 2, w, 12)
  ctx.fillStyle = '#9c7448'
  ctx.fillRect(x + 1, y + 3, w - 2, 8)
  ctx.fillStyle = '#5a3a1e'
  ctx.fillRect(x + 1, y + 9, w - 2, 2)
  ctx.fillStyle = '#3a2410'
  ctx.fillRect(x + 3, y + 14, 3, h * TILE_PX - 14)
  ctx.fillRect(x + w - 6, y + 14, 3, h * TILE_PX - 14)
}

function drawShelf(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#3a2410'
  ctx.fillRect(x + 2, y + 4, 28, 28)
  ctx.fillStyle = '#6e4e2c'
  ctx.fillRect(x + 3, y + 5, 26, 26)
  ctx.fillStyle = '#3a2410'
  ctx.fillRect(x + 3, y + 12, 26, 2)
  ctx.fillRect(x + 3, y + 22, 26, 2)
  ctx.fillStyle = '#d8b270'
  ctx.fillRect(x + 5, y + 7, 4, 4)
  ctx.fillStyle = '#9a6a3a'
  ctx.fillRect(x + 11, y + 8, 3, 3)
  ctx.fillStyle = '#d8b270'
  ctx.fillRect(x + 17, y + 7, 4, 4)
  ctx.fillStyle = '#7a8aaa'
  ctx.fillRect(x + 23, y + 9, 3, 2)
  ctx.fillStyle = '#9a6a3a'
  ctx.fillRect(x + 5, y + 16, 22, 4)
  ctx.fillStyle = '#d8b270'
  ctx.fillRect(x + 7, y + 26, 3, 3)
  ctx.fillRect(x + 14, y + 25, 3, 4)
  ctx.fillRect(x + 21, y + 26, 4, 3)
}

function drawFixtures(ctx: CanvasRenderingContext2D, fixtures: FurnSlot[], t: number) {
  for (const f of fixtures) {
    const x = f.x * TILE_PX
    const y = f.y * TILE_PX
    const w = f.w * TILE_PX
    switch (f.kind) {
      case 'hearth':
        drawHearth(ctx, x, y, t)
        break
      case 'mat':
        drawMat(ctx, x, y, w)
        break
      case 'storage':
        drawStorage(ctx, x, y)
        break
      case 'bench':
        drawBench(ctx, x, y, w)
        break
      case 'table':
        drawTable(ctx, x, y, w, f.h)
        break
      case 'shelf':
        drawShelf(ctx, x, y)
        break
    }
  }
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

export function HomeCanvas({ ctx: sceneCtx, selectedOrgId, onSelectOrg, hover }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const hitRef = useRef<Array<{ id: string; x: number; y: number; r: number }>>([])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const c = canvas.getContext('2d')
    if (!c) return
    c.imageSmoothingEnabled = false

    const host = sceneCtx.world.organisms.find(
      (o) => o.id === (sceneCtx.scene.kind === 'home' ? sceneCtx.scene.orgId : ''),
    )
    const era = host ? eraOf(sceneCtx.world, host.lineage_id) : 'pre-stone'
    const palette = ERA_PALETTE[era] ?? ERA_PALETTE['stone']
    const fixtures = fixturesLayout(era)
    const slots = occupantSlots(sceneCtx.occupants.length)

    const paint = (time: number) => {
      c.fillStyle = palette.outside
      c.fillRect(0, 0, CANVAS_W, CANVAS_H)
      drawFloor(c, palette)
      drawFixtures(c, fixtures, time)
      drawWalls(c, palette)

      const orderedSlots = slots.slice()
      hitRef.current = []
      sceneCtx.occupants.forEach((occ, i) => {
        const [cx, cy] = orderedSlots[i] ?? [7, 5]
        const px = cx * TILE_PX
        const py = cy * TILE_PX
        const stage = deriveStage(occ.org)
        const frame = Math.floor(time / 220) % 4
        const sex = (occ.org.sex ?? 'male') as 'male' | 'female'
        const sprite = pickHumanSprite(sex, stage, frame)
        const size = 32
        const dx = px - 8
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
  }, [sceneCtx, selectedOrgId, hover])

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
