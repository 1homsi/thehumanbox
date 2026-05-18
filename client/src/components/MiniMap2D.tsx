import { useEffect, useRef } from 'react'
import type { WorldState } from '../types'
import { lineageColor } from '../utils/constants'
import { useUIStore } from '../stores/store'

export function MiniMap2D({ world }: { world: WorldState }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const selectOrg = useUIStore(s => s.selectOrg)
  const followOrg = useUIStore(s => s.followOrg)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const w = world.grid.width
    const h = world.grid.height
    if (w === 0 || h === 0) return

    const PX = Math.min(Math.floor(220 / w), Math.floor(140 / h), 4) || 1
    canvas.width = w * PX
    canvas.height = h * PX

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const BIOME_TINT = [
      '#3a4628',
      '#2d3d22',
      '#5a4a2a',
      '#264036',
      '#5a5e6a',
      '#3e2620',
    ]
    const biomes = world.grid.biomes
    const depth  = world.grid.depth_map
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const d = depth?.[y]?.[x] ?? 255
        if (d < 254) {
          ctx.fillStyle = '#1a2840'
        } else {
          const b = biomes?.[y]?.[x] ?? 0
          ctx.fillStyle = BIOME_TINT[b] ?? BIOME_TINT[0]
        }
        ctx.fillRect(x * PX, y * PX, PX, PX)
      }
    }

    const ox = world.grid.origin_x ?? 0
    const oy = world.grid.origin_y ?? 0
    for (const org of world.organisms) {
      if (!org.alive) continue
      const cx = Math.round(org.x - ox) * PX + PX / 2
      const cy = Math.round(org.y - oy) * PX + PX / 2
      if (cx < 0 || cy < 0 || cx > canvas.width || cy > canvas.height) continue
      ctx.fillStyle = lineageColor(org.lineage_id)
      ctx.fillRect(cx - 1, cy - 1, 2, 2)
    }
  }, [world])

  return (
    <div
      className="thb-minimap-2d"
      onClick={() => { selectOrg(null); followOrg(null) }}
      title="Mini-map: click to clear selection"
    >
      <canvas ref={canvasRef} />
    </div>
  )
}
