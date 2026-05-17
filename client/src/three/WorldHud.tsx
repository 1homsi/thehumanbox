import { useEffect, useRef } from 'react'
import { cameraSnapshot } from './camera-state'

interface Props {}

// Compass-only strip under the minimap. Just the cardinal direction
// the camera is facing; the other stats live in the stats panel and
// don't need to be on the HUD all the time. Reads camera direction
// synchronously from the shared snapshot - no React re-renders.
const COMPASS_W = 220
const COMPASS_H = 22
const TWO_PI = Math.PI * 2

export function WorldHud({}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef    = useRef<number>(0)

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    const draw = () => {
      ctx.clearRect(0, 0, COMPASS_W, COMPASS_H)
      // Compass strip - shows cardinal direction names sliding past
      // as the user turns. 0 yaw = looking +Z.
      const yaw = Math.atan2(cameraSnapshot.dirX, cameraSnapshot.dirZ)
      const labels: { angle: number; text: string; major: boolean }[] = [
        { angle: 0,             text: 'N', major: true },
        { angle: Math.PI / 4,   text: 'NE', major: false },
        { angle: Math.PI / 2,   text: 'E', major: true },
        { angle: 3 * Math.PI / 4, text: 'SE', major: false },
        { angle: Math.PI,       text: 'S', major: true },
        { angle: -Math.PI / 4,  text: 'NW', major: false },
        { angle: -Math.PI / 2,  text: 'W', major: true },
        { angle: -3 * Math.PI / 4, text: 'SW', major: false },
      ]
      ctx.font = '11px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const cx = COMPASS_W / 2
      const cy = 14
      for (const lbl of labels) {
        // Shortest angular distance to current yaw.
        let diff = lbl.angle - yaw
        while (diff >  Math.PI) diff -= TWO_PI
        while (diff < -Math.PI) diff += TWO_PI
        const x = cx + (diff / (Math.PI / 2)) * 80   // 80 px per 90°
        if (x < -20 || x > COMPASS_W + 20) continue
        const opacity = 1 - Math.abs(diff) / Math.PI
        ctx.fillStyle = lbl.major
          ? `rgba(255, 255, 255, ${(0.4 + opacity * 0.6).toFixed(2)})`
          : `rgba(180, 200, 220, ${(0.3 + opacity * 0.4).toFixed(2)})`
        ctx.fillText(lbl.text, x, cy)
      }
      // Cursor: triangle pointing down at the centre.
      ctx.fillStyle = '#ff8a3a'
      ctx.beginPath()
      ctx.moveTo(cx, 0)
      ctx.lineTo(cx - 4, 6)
      ctx.lineTo(cx + 4, 6)
      ctx.closePath()
      ctx.fill()

      rafRef.current = requestAnimationFrame(draw)
    }
    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  return (
    <div className="thb-3d-hud" style={wrap}>
      <canvas ref={canvasRef} width={COMPASS_W} height={COMPASS_H} style={canvasStyle} />
    </div>
  )
}

const wrap: React.CSSProperties = {
  position: 'fixed',
  top: 60 + 110 + 8,   // below minimap (110px + padding)
  right: 16,
  width: COMPASS_W + 4,
  padding: 2,
  background: 'rgba(12, 16, 24, 0.75)',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: 4,
  pointerEvents: 'none',
  zIndex: 5,
}

const canvasStyle: React.CSSProperties = {
  width: COMPASS_W,
  height: COMPASS_H,
  display: 'block',
}
