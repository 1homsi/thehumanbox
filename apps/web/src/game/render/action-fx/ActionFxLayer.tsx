import { useEffect, useRef } from 'react'
import { prefersReducedMotion } from '../../../shared/motion'
import { TILE } from '../../model/palette'
import { INK } from '../art-palette'
import { FLOAT_MS, snapshot, subscribeFx, type ActiveFx, type FloatText } from './fx-store'
import { PAINTERS, seeded, type Painter } from './fx-painters'

type Camera = { x: number; y: number; zoom: number }

const FLOAT_COLORS: Record<FloatText['tone'], string> = {
  harm: 'rgb(238,126,98)',
  help: 'rgb(192,226,132)',
  info: 'rgb(240,226,190)',
}
const INK_CSS = `rgb(${INK[0]},${INK[1]},${INK[2]})`
const FLOAT_FONT = 'bold 13px ui-monospace, Menlo, monospace'

/**
 * Draws the action effects (see `fx-store.ts`) on a canvas over the map, in whole art pixels at the
 * map's zoom. It only runs while something is playing: the first effect wakes it, and it stops
 * asking for frames once the last one ends. Big effects shake the map, unless the player asked
 * their system for less motion.
 */
export function ActionFxLayer({
  cameraRef,
  viewport,
  ox,
  oy,
  shakeTarget,
}: {
  cameraRef: React.RefObject<Camera>
  viewport: { w: number; h: number }
  ox: number
  oy: number
  /** The element moved by screen shake: the map's container. */
  shakeTarget: React.RefObject<HTMLElement | null>
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const latest = useRef({ viewport, ox, oy })
  latest.current = { viewport, ox, oy }

  useEffect(() => {
    let raf = 0
    let shaking = false
    const stopShake = () => {
      if (shaking && shakeTarget.current) shakeTarget.current.style.translate = ''
      shaking = false
    }
    const draw = () => {
      raf = 0
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (!canvas || !ctx) return
      const now = performance.now()
      const { fxs, floats, shake } = snapshot(now)
      const { viewport: vp, ox: originX, oy: originY } = latest.current
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const bw = Math.round(vp.w * dpr)
      const bh = Math.round(vp.h * dpr)
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw
        canvas.height = bh
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, vp.w, vp.h)
      const cam = cameraRef.current
      const reduced = prefersReducedMotion()
      for (const fx of fxs) drawFx(ctx, fx, now, cam, vp, originX, originY, reduced)
      for (const f of floats) drawFloat(ctx, f, now, cam, vp, originX, originY)
      ctx.globalAlpha = 1
      // Shake the map while a big effect lands.
      const target = shakeTarget.current
      if (shake && target && !reduced && now >= shake.start) {
        const k = (now - shake.start) / shake.duration
        const amp = shake.strength * (1 - k) * (1 - k)
        const jolt = seeded(Math.floor(now / 45))
        target.style.translate = `${Math.round((jolt() * 2 - 1) * amp)}px ${Math.round((jolt() * 2 - 1) * amp)}px`
        shaking = true
      } else stopShake()
      if (fxs.length || floats.length || shake) raf = requestAnimationFrame(draw)
      else {
        ctx.clearRect(0, 0, vp.w, vp.h)
        stopShake()
      }
    }
    const wake = () => {
      if (!raf) raf = requestAnimationFrame(draw)
    }
    const unsubscribe = subscribeFx(wake)
    wake()
    return () => {
      unsubscribe()
      if (raf) cancelAnimationFrame(raf)
      stopShake()
    }
  }, [cameraRef, shakeTarget])

  return (
    <canvas
      ref={canvasRef}
      className="action-fx"
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 6,
        imageRendering: 'pixelated',
      }}
    />
  )
}

/** Where a tile's centre is on screen. */
function toScreen(tx: number, ty: number, cam: Camera, vp: { w: number; h: number }, ox: number, oy: number) {
  return {
    x: ((tx - ox + 0.5) * TILE - cam.x) * cam.zoom + vp.w / 2,
    y: ((ty - oy + 0.5) * TILE - cam.y) * cam.zoom + vp.h / 2,
  }
}

function drawFx(
  ctx: CanvasRenderingContext2D,
  fx: ActiveFx,
  now: number,
  cam: Camera,
  vp: { w: number; h: number },
  ox: number,
  oy: number,
  reduced: boolean,
) {
  const z = Math.max(0.05, cam.zoom)
  const centre =
    fx.x === null || fx.y === null ? { x: vp.w / 2, y: vp.h / 2 } : toScreen(fx.x, fx.y, cam, vp, ox, oy)
  const r = fx.r * TILE
  // Skip effects far off the view (their plumes reach up to a few radii).
  const margin = (r * 3 + 80) * z
  if (centre.x < -margin || centre.x > vp.w + margin || centre.y < -margin || centre.y > vp.h + margin * 1.5)
    return
  const cx = Math.round(centre.x)
  const cy = Math.round(centre.y)
  let base = 1
  const painter: Painter = {
    px: (x, y, color, size = 1) => {
      const x0 = Math.round(cx + x * z)
      const y0 = Math.round(cy + y * z)
      ctx.fillStyle = color
      ctx.fillRect(
        x0,
        y0,
        Math.max(1, Math.round(cx + (x + size) * z) - x0),
        Math.max(1, Math.round(cy + (y + size) * z) - y0),
      )
    },
    rect: (x, y, w, h, color) => {
      const x0 = Math.round(cx + x * z)
      const y0 = Math.round(cy + y * z)
      ctx.fillStyle = color
      ctx.fillRect(
        x0,
        y0,
        Math.max(1, Math.round(cx + (x + w) * z) - x0),
        Math.max(1, Math.round(cy + (y + h) * z) - y0),
      )
    },
    alpha: (a) => {
      base = Math.max(0, Math.min(1, a))
      ctx.globalAlpha = base
    },
    screen: (color, a) => {
      ctx.globalAlpha = Math.max(0, Math.min(1, a))
      ctx.fillStyle = color
      ctx.fillRect(0, 0, vp.w, vp.h)
      ctx.globalAlpha = base
    },
  }
  const ms = now - fx.start
  ctx.globalAlpha = 1
  PAINTERS[fx.kind](painter, {
    t: Math.max(0, Math.min(1, ms / fx.duration)),
    ms,
    r,
    rand: seeded(fx.id * 7919 + 1),
    reduced,
    viewW: vp.w / 2 / z,
    viewH: vp.h / 2 / z,
  })
  ctx.globalAlpha = 1
}

function drawFloat(
  ctx: CanvasRenderingContext2D,
  f: FloatText,
  now: number,
  cam: Camera,
  vp: { w: number; h: number },
  ox: number,
  oy: number,
) {
  const k = (now - f.start) / FLOAT_MS
  if (k < 0 || k >= 1) return
  const at = toScreen(f.x, f.y, cam, vp, ox, oy)
  const rise = 28 * (1 - (1 - k) * (1 - k))
  const x = Math.round(at.x)
  const y = Math.round(at.y - 18 - f.slot * 16 - rise)
  if (x < -200 || x > vp.w + 200 || y < -40 || y > vp.h + 40) return
  ctx.globalAlpha = k < 0.08 ? k / 0.08 : k > 0.7 ? (1 - k) / 0.3 : 1
  ctx.font = FLOAT_FONT
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 3
  ctx.strokeStyle = INK_CSS
  ctx.strokeText(f.text, x, y)
  ctx.fillStyle = FLOAT_COLORS[f.tone]
  ctx.fillText(f.text, x, y)
  ctx.globalAlpha = 1
}
