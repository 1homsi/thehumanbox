import { useEffect, useRef, type MutableRefObject } from 'react'
import type { WorldState } from '../../types'
import { TILE } from '../../world/palette'
import { isMapControl, screenToMap, type MapCamera, type MapSize } from './camera-controls'
import './world-map.css'

interface Props {
  world: WorldState
  cameraRef: MutableRefObject<MapCamera>
  viewport: MapSize
  container: HTMLDivElement | null
  toolLabel?: string | null
  toolStatus?: string | null
  toolRadius?: number
}

export function WorldMapHud({
  world,
  cameraRef,
  viewport,
  container,
  toolLabel,
  toolRadius = 0,
  toolStatus,
}: Props) {
  const brush = useRef<HTMLDivElement>(null)
  const ox = world.grid.origin_x ?? 0,
    oy = world.grid.origin_y ?? 0
  useEffect(() => {
    const ring = brush.current
    if (!container || !ring || !toolLabel) return
    const move = (e: PointerEvent) => {
      if (isMapControl(e.target)) {
        ring.style.display = 'none'
        return
      }
      const rect = container.getBoundingClientRect()
      const point = { x: e.clientX - rect.left, y: e.clientY - rect.top }
      const position = screenToMap(cameraRef.current, point, viewport)
      const tileX = Math.round(position.x / TILE + ox) - ox
      const tileY = Math.round(position.y / TILE + oy) - oy
      const inside = tileX >= 0 && tileY >= 0 && tileX < world.grid.width && tileY < world.grid.height
      ring.style.display = inside ? 'block' : 'none'
      const size = Math.max(12, (toolRadius * 2 + 1) * TILE * cameraRef.current.zoom)
      ring.style.width = `${size}px`
      ring.style.height = `${size}px`
      ring.style.left = `${((tileX + 0.5) * TILE - cameraRef.current.x) * cameraRef.current.zoom + viewport.w / 2}px`
      ring.style.top = `${((tileY + 0.5) * TILE - cameraRef.current.y) * cameraRef.current.zoom + viewport.h / 2}px`
    }
    const leave = () => {
      ring.style.display = 'none'
    }
    container.addEventListener('pointermove', move)
    container.addEventListener('pointerleave', leave)
    container.addEventListener('wheel', leave)
    return () => {
      container.removeEventListener('pointermove', move)
      container.removeEventListener('pointerleave', leave)
      container.removeEventListener('wheel', leave)
    }
  }, [container, toolLabel, toolRadius, cameraRef, viewport, world.grid.width, world.grid.height, ox, oy])

  return (
    <>
      {toolLabel && (
        <div className="map2d-tool-hint" data-map-ui role="status">
          <strong>{toolLabel}</strong>
          <span>
            {toolStatus?.includes('applied') || toolStatus?.includes('failed')
              ? toolStatus
              : 'Click to apply · drag to pan · Esc to cancel'}
          </span>
        </div>
      )}
      {toolLabel && <div className="map2d-brush" ref={brush} aria-hidden="true" />}
    </>
  )
}
