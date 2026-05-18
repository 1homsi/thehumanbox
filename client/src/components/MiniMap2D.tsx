import { useEffect, useRef } from 'react'
import type { WorldState } from '../types'
import { lineageColor } from '../utils/constants'
import { useUIStore } from '../stores/store'

/**
 * Compact top-right overview that renders the same world the canvas
 * is rendering, but tiny — useful when overlays obscure organism
 * positions or to spot lineage clusters at a glance. Clicking the
 * map clears the selected/follow state so the main canvas re-centers.
 *
 * We redraw on every WorldState change (≈ 2 Hz via React throttle).
 * Cheap: a 200×100 canvas with one px per tile.
 */
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

    // Pick the largest pixel-per-tile that fits in 220×140
    const PX = Math.min(Math.floor(220 / w), Math.floor(140 / h), 4) || 1
    canvas.width = w * PX
    canvas.height = h * PX

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Biome tint background. Keep palette muted so org dots pop.
    const BIOME_TINT = [
      '#3a4628',  // 0 grass
      '#2d3d22',  // 1 forest
      '#5a4a2a',  // 2 desert
      '#264036',  // 3 wetland
      '#5a5e6a',  // 4 tundra
      '#3e2620',  // 5 volcanic
    ]
    const biomes = world.grid.biomes
    const depth  = world.grid.depth_map
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const d = depth?.[y]?.[x] ?? 255
        if (d < 254) {
          ctx.fillStyle = '#1a2840'    // water
        } else {
          const b = biomes?.[y]?.[x] ?? 0
          ctx.fillStyle = BIOME_TINT[b] ?? BIOME_TINT[0]
        }
        ctx.fillRect(x * PX, y * PX, PX, PX)
      }
    }

    // Organism dots in lineage colour. Skip dead orgs.
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
