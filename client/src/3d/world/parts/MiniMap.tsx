import { useEffect, useRef } from 'react'
import type { OrganismState, AnimalState } from '../../../types'
import { lineageColor } from '../../../utils/constants'
import { TILE_SCALE } from './constants'
import { cameraSnapshot, cameraCommand } from './camera-state'
import { useUIStore } from '../../../stores/store'

interface Props {
  organisms: OrganismState[]
  animals?:  AnimalState[]
  tiles?:    number[][]
  depthMap?: number[][]
  biomes?:   number[][]
  width:     number
  height:    number
}

const T_FIRE     = 4
const T_CAMPFIRE = 7
const T_HUT      = 8

const MAP_W = 220
const MAP_H = 110

const BIOME_HEX: string[] = [
  '#6a9853',
  '#3a5d2f',
  '#c2a566',
  '#4d8068',
  '#d8dce8',
  '#4a3d3d',
]

export function MiniMap({ organisms, animals, tiles, depthMap, biomes, width, height }: Props) {
  const canvasRef     = useRef<HTMLCanvasElement>(null)
  const terrainRef    = useRef<HTMLCanvasElement | null>(null)
  const landmarksRef  = useRef<{ huts: [number, number][]; campfires: [number, number][]; fires: [number, number][] }>(
    { huts: [], campfires: [], fires: [] },
  )
  const rafRef        = useRef<number>(0)
  const selectedOrgId = useUIStore(s => s.selectedOrgId)

  useEffect(() => {
    const huts: [number, number][] = []
    const campfires: [number, number][] = []
    const fires: [number, number][] = []
    if (tiles) {
      for (let y = 0; y < height; y++) {
        const row = tiles[y]
        if (!row) continue
        for (let x = 0; x < width; x++) {
          const t = row[x]
          if      (t === T_HUT)      huts.push([x, y])
          else if (t === T_CAMPFIRE) campfires.push([x, y])
          else if (t === T_FIRE)     fires.push([x, y])
        }
      }
    }
    landmarksRef.current = { huts, campfires, fires }
  }, [tiles, width, height])

  useEffect(() => {
    if (!depthMap || !biomes) return
    const tmp = document.createElement('canvas')
    tmp.width  = width
    tmp.height = height
    const tctx = tmp.getContext('2d')
    if (!tctx) return
    const img = tctx.createImageData(width, height)
    for (let y = 0; y < height; y++) {
      const dRow = depthMap[y]
      const bRow = biomes[y]
      if (!dRow || !bRow) continue
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4
        const d = dRow[x] ?? 255
        if (d < 254) {
          const t = Math.max(0, Math.min(1, 1 - d / 200))
          img.data[i]     = 30 + (1 - t) * 50
          img.data[i + 1] = 80 + (1 - t) * 60
          img.data[i + 2] = 130 + (1 - t) * 40
          img.data[i + 3] = 255
        } else {
          const b = bRow[x] ?? 0
          const hex = BIOME_HEX[b] ?? BIOME_HEX[0]
          img.data[i]     = parseInt(hex.slice(1, 3), 16)
          img.data[i + 1] = parseInt(hex.slice(3, 5), 16)
          img.data[i + 2] = parseInt(hex.slice(5, 7), 16)
          img.data[i + 3] = 255
        }
      }
    }
    tctx.putImageData(img, 0, 0)
    terrainRef.current = tmp
  }, [depthMap, biomes, width, height])

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return

    const draw = () => {
      ctx.clearRect(0, 0, MAP_W, MAP_H)
      const terrain = terrainRef.current
      if (terrain) {
        ctx.imageSmoothingEnabled = false
        ctx.drawImage(terrain, 0, 0, MAP_W, MAP_H)
      } else {
        ctx.fillStyle = '#0c1018'
        ctx.fillRect(0, 0, MAP_W, MAP_H)
      }

      if (animals && animals.length) {
        ctx.fillStyle = 'rgba(180, 140, 80, 0.85)'
        for (const a of animals) {
          const mx = (a.x / width)  * MAP_W
          const my = (a.y / height) * MAP_H
          ctx.fillRect(Math.floor(mx), Math.floor(my), 1, 1)
        }
      }

      const lm = landmarksRef.current
      ctx.fillStyle = '#8a6a40'
      for (const [hx, hy] of lm.huts) {
        const mx = (hx / width)  * MAP_W
        const my = (hy / height) * MAP_H
        ctx.fillRect(Math.floor(mx) - 1, Math.floor(my) - 1, 3, 3)
      }
      const tNow = performance.now() * 0.006
      const camp = 0.85 + Math.sin(tNow * 4) * 0.15
      ctx.fillStyle = `rgba(255, 144, 40, ${camp.toFixed(2)})`
      for (const [cx2, cy2] of lm.campfires) {
        const mx = (cx2 / width)  * MAP_W
        const my = (cy2 / height) * MAP_H
        ctx.fillRect(Math.floor(mx), Math.floor(my), 2, 2)
      }
      const fireFlick = 0.7 + Math.sin(tNow * 9) * 0.3
      ctx.fillStyle = `rgba(255, 90, 20, ${fireFlick.toFixed(2)})`
      for (const [fx, fy] of lm.fires) {
        const mx = (fx / width)  * MAP_W
        const my = (fy / height) * MAP_H
        ctx.beginPath()
        ctx.arc(mx, my, 2.4, 0, Math.PI * 2)
        ctx.fill()
      }

      let selDot: [number, number] | null = null
      for (const o of organisms) {
        if (!o.alive) continue
        const mx = (o.x / width)  * MAP_W
        const my = (o.y / height) * MAP_H
        if (o.id === selectedOrgId) {
          selDot = [mx, my]
          continue
        }
        ctx.fillStyle = lineageColor(o.lineage_id)
        ctx.fillRect(Math.floor(mx), Math.floor(my), 2, 2)
      }

      if (selDot) {
        const [mx, my] = selDot
        const t  = performance.now() * 0.005
        const rr = 4 + Math.sin(t) * 1.5
        ctx.beginPath()
        ctx.arc(mx, my, rr, 0, Math.PI * 2)
        ctx.strokeStyle = '#ff8a3a'
        ctx.lineWidth   = 1.4
        ctx.stroke()
        ctx.fillStyle = '#ffcf6a'
        ctx.fillRect(Math.floor(mx) - 1, Math.floor(my) - 1, 3, 3)
      }

      const cx  = (cameraSnapshot.x / TILE_SCALE / width)  * MAP_W
      const cz  = (cameraSnapshot.z / TILE_SCALE / height) * MAP_H
      const yaw = Math.atan2(cameraSnapshot.dirX, cameraSnapshot.dirZ)
      ctx.save()
      ctx.translate(cx, cz)
      ctx.rotate(yaw)
      ctx.fillStyle   = '#ff6060'
      ctx.strokeStyle = '#000'
      ctx.lineWidth   = 0.8
      ctx.beginPath()
      ctx.moveTo(0, -6)
      ctx.lineTo(-4, 5)
      ctx.lineTo(4, 5)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      ctx.restore()

      rafRef.current = requestAnimationFrame(draw)
    }
    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [organisms, animals, width, height, selectedOrgId])

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const tx = (mx / MAP_W) * width
    const ty = (my / MAP_H) * height
    const wx = tx * TILE_SCALE
    const wz = ty * TILE_SCALE
    cameraCommand.teleport = { x: wx, y: cameraSnapshot.y, z: wz }
  }

  return (
    <div className="thb-3d-minimap" style={miniMapWrap}>
      <canvas
        ref={canvasRef}
        width={MAP_W}
        height={MAP_H}
        onClick={onClick}
        style={miniMapCanvas}
      />
    </div>
  )
}

const miniMapWrap: React.CSSProperties = {
  position: 'fixed',
  top: 60,
  right: 16,
  width: MAP_W + 4,
  height: MAP_H + 4,
  padding: 2,
  background: 'rgba(12, 16, 24, 0.75)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 4,
  pointerEvents: 'auto',
  zIndex: 5,
}

const miniMapCanvas: React.CSSProperties = {
  width: MAP_W,
  height: MAP_H,
  imageRendering: 'pixelated',
  display: 'block',
  cursor: 'crosshair',
  pointerEvents: 'auto',
}
