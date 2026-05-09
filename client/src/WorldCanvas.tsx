import { useEffect, useRef } from 'react'
import type { WorldState } from './types'

const TILE_SIZE = 16

const TILE_COLORS: Record<number, string> = {
  0: '#0a0a0a',   // void
  1: '#4a7c3f',   // grass
  2: '#2e6db4',   // water
  3: '#6abf45',   // food
  4: '#e8450a',   // fire
  5: '#888888',   // rock
  6: '#555544',   // ash
}

function lineageColor(lineageId: string): string {
  let hash = 0
  for (const c of lineageId) hash = ((hash * 31) + c.charCodeAt(0)) >>> 0
  const hue = hash % 360
  return `hsl(${hue}, 80%, 65%)`
}

const THOUGHT_COLORS: Record<string, string> = {
  eating:                '#6abf45',
  drinking:              '#4499ff',
  'heat dangerous':      '#e8450a',
  'hungry - searching':  '#cc8800',
  'thirsty - searching': '#0099cc',
  'moving to known food':  '#aadd55',
  'moving to known water': '#55aaff',
  'avoiding danger':     '#ff6644',
  dying:                 '#ff0000',
  satisfied:             '#ffffff',
  socializing:           '#ffdd88',
  wary:                  '#ff9900',
  'signaling food':      '#ffff44',
  'sounding alarm':      '#ff4488',
  challenging:           '#ff2200',
  'challenging alone':   '#cc4422',
  exploring:             '#888888',
  observing:             '#555555',
  'feeling weak':        '#bbff44',
  'coexisting peacefully': '#55ff88',
}

interface Props {
  world: WorldState
}

export function WorldCanvas({ world }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { width, height, tiles, fire_intensity } = world.grid

    canvas.width  = width  * TILE_SIZE
    canvas.height = height * TILE_SIZE

    // Draw tiles
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const t = tiles[y][x]
        ctx.fillStyle = TILE_COLORS[t] ?? '#111'
        ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE)

        // Fire glow overlay
        if (t === 4) {
          const intensity = fire_intensity[y][x]
          ctx.fillStyle = `rgba(255, 120, 0, ${intensity * 0.5})`
          ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE)
        }
      }
    }

    // Territory overlay - nearest-organism Voronoi, radius-capped
    const liveOrgs = world.organisms.filter(o => o.alive && o.lineage_id)
    if (liveOrgs.length > 0) {
      const TERRITORY_RADIUS = 9  // tiles
      for (let ty = 0; ty < height; ty++) {
        for (let tx = 0; tx < width; tx++) {
          let nearest = null as typeof liveOrgs[0] | null
          let nearestDist = TERRITORY_RADIUS + 1
          for (const org of liveOrgs) {
            const d = Math.abs(org.x - tx) + Math.abs(org.y - ty)
            if (d < nearestDist) { nearestDist = d; nearest = org }
          }
          if (nearest && nearestDist <= TERRITORY_RADIUS) {
            const alpha = 0.10 * (1 - nearestDist / TERRITORY_RADIUS)
            ctx.fillStyle = lineageColor(nearest.lineage_id).replace('hsl', 'hsla').replace(')', `, ${alpha})`)
            ctx.fillRect(tx * TILE_SIZE, ty * TILE_SIZE, TILE_SIZE, TILE_SIZE)
          }
        }
      }
    }

    // Night overlay - darkens canvas proportional to night depth
    if (!world.is_day) {
      const phase = world.day_progress  // 0.7–1.0 during night
      const nightDepth = Math.sin(Math.PI * (phase - 0.7) / 0.3)  // 0 at dusk/dawn, 1 at deep night
      ctx.fillStyle = `rgba(0, 0, 40, ${0.38 * nightDepth})`
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }

    // Grid lines (subtle)
    ctx.strokeStyle = 'rgba(0,0,0,0.15)'
    ctx.lineWidth = 0.5
    for (let x = 0; x <= width; x++) {
      ctx.beginPath(); ctx.moveTo(x * TILE_SIZE, 0); ctx.lineTo(x * TILE_SIZE, height * TILE_SIZE); ctx.stroke()
    }
    for (let y = 0; y <= height; y++) {
      ctx.beginPath(); ctx.moveTo(0, y * TILE_SIZE); ctx.lineTo(width * TILE_SIZE, y * TILE_SIZE); ctx.stroke()
    }

    // Draw organisms
    for (const org of world.organisms) {
      const px = org.x * TILE_SIZE + TILE_SIZE / 2
      const py = org.y * TILE_SIZE + TILE_SIZE / 2
      const color = THOUGHT_COLORS[org.thought] ?? '#cccccc'

      // Drop shadow
      ctx.fillStyle = 'rgba(0,0,0,0.4)'
      ctx.beginPath()
      ctx.ellipse(px + 1, py + 3, 5, 3, 0, 0, Math.PI * 2)
      ctx.fill()

      // Signal/combat pulse ring (outermost, drawn before lineage ring)
      if (org.thought === 'signaling food' || org.thought === 'sounding alarm') {
        const sigColor = org.thought === 'signaling food' ? 'rgba(255,255,68,0.6)' : 'rgba(255,68,136,0.6)'
        ctx.strokeStyle = sigColor
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(px, py, 10, 0, Math.PI * 2)
        ctx.stroke()
      } else if (org.thought === 'challenging' || org.thought === 'challenging alone') {
        // Sharp red diamond shape for combat
        ctx.strokeStyle = org.thought === 'challenging' ? 'rgba(255,34,0,0.85)' : 'rgba(204,68,34,0.7)'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(px, py - 11)
        ctx.lineTo(px + 11, py)
        ctx.lineTo(px, py + 11)
        ctx.lineTo(px - 11, py)
        ctx.closePath()
        ctx.stroke()
      }

      // Infection aura - sickly glow around infected organisms
      if (org.alive && org.infection > 0.15) {
        ctx.beginPath()
        ctx.arc(px, py, 8, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(187, 255, 68, ${org.infection * 0.3})`
        ctx.fill()
      }

      // Lineage ring (tribe identity) - thickness scales with resilience trait
      if (org.lineage_id) {
        ctx.strokeStyle = lineageColor(org.lineage_id)
        ctx.lineWidth = org.traits ? 1 + org.traits.resilience * 2 : 2
        ctx.beginPath()
        ctx.arc(px, py, 7, 0, Math.PI * 2)
        ctx.stroke()
      }

      // Body
      ctx.fillStyle = org.alive ? color : '#333'
      ctx.beginPath()
      ctx.arc(px, py, 5, 0, Math.PI * 2)
      ctx.fill()

      // Energy bar (green) + hydration bar (blue)
      const barW = TILE_SIZE - 2
      const bx = org.x * TILE_SIZE + 1
      ctx.fillStyle = 'rgba(0,0,0,0.6)'
      ctx.fillRect(bx, org.y * TILE_SIZE - 5, barW, 2)
      ctx.fillStyle = '#55dd55'
      ctx.fillRect(bx, org.y * TILE_SIZE - 5, barW * org.energy, 2)
      ctx.fillStyle = 'rgba(0,0,0,0.6)'
      ctx.fillRect(bx, org.y * TILE_SIZE - 2, barW, 2)
      ctx.fillStyle = '#4499ff'
      ctx.fillRect(bx, org.y * TILE_SIZE - 2, barW * org.hydration, 2)

      // Name
      ctx.fillStyle = 'rgba(255,255,255,0.85)'
      ctx.font = '9px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(org.name, px, py - 9)

      // Current thought (small, italic-ish)
      if (org.alive && org.thought && org.thought !== 'observing') {
        ctx.fillStyle = 'rgba(180,220,255,0.7)'
        ctx.font = '8px monospace'
        ctx.fillText(org.thought, px, py - 18)
      }
    }
  }, [world])

  return (
    <canvas
      ref={canvasRef}
      style={{ imageRendering: 'pixelated', border: '1px solid #333' }}
    />
  )
}
