import { useEffect, useRef, type MutableRefObject } from 'react'
import type { WorldState } from '../../../shared/types'
import { TILE } from '../../model/palette'
import { useCameraFocus } from '../../../state/camera-focus'
import type { MapCamera, MapSize } from '../camera-controls'
import { paintMinimapPixels } from './minimap-paint'

/** Longest side of the minimap, in CSS pixels. */
const BOX = 150
/** Repaint at most this often: the terrain and the living change every simulation frame. */
const PAINT_EVERY_MS = 500
/** The camera rectangle follows the view this often (it moves without a React render). */
const RECT_EVERY_MS = 120

interface Props {
  world: WorldState
  cameraRef: MutableRefObject<MapCamera>
  viewport: MapSize
}

/**
 * A small map of the whole world in the corner: terrain, every building and living person in
 * their tribe's colour, and the rectangle the camera shows. A click moves the camera there.
 */
export function WorldMinimap({ world, cameraRef, viewport }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rectRef = useRef<HTMLDivElement>(null)
  const { width, height } = world.grid
  const ox = world.grid.origin_x ?? 0
  const oy = world.grid.origin_y ?? 0
  const scale = BOX / Math.max(1, width, height)
  // The canvas is painted at the size it is shown, so people and buildings stay visible.
  const boxW = Math.max(1, Math.round(width * scale))
  const boxH = Math.max(1, Math.round(height * scale))

  // Paint the grid into the canvas, at most every PAINT_EVERY_MS.
  const lastPaint = useRef(0)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !world.grid.tiles || width <= 0 || height <= 0) return
    const paint = () => {
      lastPaint.current = performance.now()
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      if (canvas.width !== boxW || canvas.height !== boxH) {
        canvas.width = boxW
        canvas.height = boxH
      }
      const image = ctx.createImageData?.(boxW, boxH)
      if (!image?.data) return
      paintMinimapPixels(
        image.data,
        {
          width,
          height,
          ox,
          oy,
          tiles: world.grid.tiles,
          roads: world.grid.roads,
          organisms: world.organisms ?? [],
          buildings: world.buildings ?? [],
        },
        boxW,
        boxH,
      )
      ctx.putImageData(image, 0, 0)
    }
    const wait = PAINT_EVERY_MS - (performance.now() - lastPaint.current)
    if (wait <= 0) {
      paint()
      return
    }
    const timer = window.setTimeout(paint, wait)
    return () => window.clearTimeout(timer)
  }, [world, width, height, ox, oy, boxW, boxH])

  // Move the camera rectangle to what the map shows now.
  useEffect(() => {
    const place = () => {
      const rect = rectRef.current
      if (!rect) return
      const cam = cameraRef.current
      const zoom = Math.max(0.01, cam.zoom)
      const halfW = viewport.w / 2 / zoom / TILE
      const halfH = viewport.h / 2 / zoom / TILE
      const left = Math.max(0, (cam.x / TILE - halfW) * scale)
      const top = Math.max(0, (cam.y / TILE - halfH) * scale)
      const right = Math.min(width * scale, (cam.x / TILE + halfW) * scale)
      const bottom = Math.min(height * scale, (cam.y / TILE + halfH) * scale)
      rect.style.left = `${left}px`
      rect.style.top = `${top}px`
      rect.style.width = `${Math.max(2, right - left)}px`
      rect.style.height = `${Math.max(2, bottom - top)}px`
    }
    place()
    const timer = window.setInterval(place, RECT_EVERY_MS)
    return () => window.clearInterval(timer)
  }, [cameraRef, viewport.w, viewport.h, scale, width, height])

  return (
    <div
      data-map-ui
      aria-label="Minimap: click to move the view"
      role="img"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        const box = event.currentTarget.querySelector('canvas')?.getBoundingClientRect()
        if (!box) return
        const col = Math.floor((event.clientX - box.left) / scale)
        const row = Math.floor((event.clientY - box.top) / scale)
        useCameraFocus.getState().focusTile(col + ox, row + oy)
      }}
      style={{
        position: 'absolute',
        left: 12,
        bottom: 44,
        zIndex: 15,
        padding: 4,
        background: 'var(--px-wood, #2b2118)',
        border: '2px solid var(--px-brass, #8a6a3e)',
        boxShadow: '0 0 0 2px var(--px-ink, #110c08)',
        cursor: 'pointer',
      }}
    >
      <div style={{ position: 'relative', width: boxW, height: boxH }}>
        <canvas
          ref={canvasRef}
          width={boxW}
          height={boxH}
          style={{
            display: 'block',
            width: boxW,
            height: boxH,
            imageRendering: 'pixelated',
          }}
        />
        <div
          ref={rectRef}
          style={{
            position: 'absolute',
            border: '1px solid var(--px-gold, #e8b64c)',
            pointerEvents: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>
    </div>
  )
}
