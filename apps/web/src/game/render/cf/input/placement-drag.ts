import { useEffect, useRef, type MutableRefObject } from 'react'
import { TILE } from '../../../model/palette'
import { isMapControl, type MapCamera } from '../../camera-controls'
import { PlacementStroke, type PlacementPoint } from './placement-stroke'

/** One placement, in the same shape a map tap reports: map pixels, and the container point it landed on. */
export interface PlacementTap {
  worldX: number
  worldY: number
  screenX: number
  screenY: number
}

interface PlacementDragOptions {
  /** On when a placement tool is armed and the mouse drag should place rather than pan. */
  enabled: boolean
  containerEl: HTMLDivElement | null
  cameraStateRef: MutableRefObject<MapCamera>
  containerW: number
  containerH: number
  /** Tiles between two placements in one drag (see `placementSpacing`). */
  spacingTiles: number
  onPlace: (tap: PlacementTap) => void
}

/**
 * Mouse drags with a placement tool armed: the press places, and the drag lays placements along its
 * path, spaced by the brush (`PlacementStroke` does the spacing and the per-drag cap). The xipjs camera
 * is told to leave the primary button alone while this is on (see `CfMapCameraController`), so the
 * drag places instead of panning. Middle-button drags still pan, and touch is untouched: a finger
 * still pans and taps.
 *
 * The listeners are native, on the container and the window, so they see the press on the map canvas
 * and the moves wherever the pointer goes during the drag.
 */
export function usePlacementDrag({
  enabled,
  containerEl,
  cameraStateRef,
  containerW,
  containerH,
  spacingTiles,
  onPlace,
}: PlacementDragOptions) {
  const onPlaceRef = useRef(onPlace)
  onPlaceRef.current = onPlace

  useEffect(() => {
    if (!enabled || !containerEl) return
    let stroke: { pointerId: number; path: PlacementStroke } | null = null

    /** A container point, in map pixels under the camera as it is now. */
    const toMap = (clientX: number, clientY: number) => {
      const rect = containerEl.getBoundingClientRect()
      const screenX = clientX - rect.left
      const screenY = clientY - rect.top
      const cam = cameraStateRef.current
      return {
        worldX: cam.x + (screenX - containerW / 2) / cam.zoom,
        worldY: cam.y + (screenY - containerH / 2) / cam.zoom,
      }
    }
    const placeAt = (points: PlacementPoint[]) => {
      if (points.length === 0) return
      const cam = cameraStateRef.current
      for (const p of points) {
        onPlaceRef.current({
          worldX: p.x,
          worldY: p.y,
          screenX: (p.x - cam.x) * cam.zoom + containerW / 2,
          screenY: (p.y - cam.y) * cam.zoom + containerH / 2,
        })
      }
    }
    const endStroke = () => {
      stroke = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onEnd)
      window.removeEventListener('pointercancel', onEnd)
    }
    const onDown = (e: PointerEvent) => {
      if (stroke) return
      if (e.pointerType !== 'mouse' || e.button !== 0) return
      // Only the map itself starts a placing drag: the HUD, the map controls and the hover cards stay as they were.
      if (!(e.target instanceof HTMLCanvasElement) || isMapControl(e.target)) return
      const at = toMap(e.clientX, e.clientY)
      stroke = { pointerId: e.pointerId, path: new PlacementStroke(spacingTiles * TILE) }
      placeAt(stroke.path.advance(at.worldX, at.worldY))
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onEnd)
      window.addEventListener('pointercancel', onEnd)
    }
    const onMove = (e: PointerEvent) => {
      if (!stroke || e.pointerId !== stroke.pointerId) return
      const at = toMap(e.clientX, e.clientY)
      placeAt(stroke.path.advance(at.worldX, at.worldY))
    }
    const onEnd = (e: PointerEvent) => {
      if (!stroke || e.pointerId !== stroke.pointerId) return
      endStroke()
    }
    containerEl.addEventListener('pointerdown', onDown)
    return () => {
      containerEl.removeEventListener('pointerdown', onDown)
      endStroke()
    }
  }, [enabled, containerEl, cameraStateRef, containerW, containerH, spacingTiles])
}
