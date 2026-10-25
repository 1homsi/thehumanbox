import { useEffect, useRef, type MutableRefObject } from 'react'
import { useUIStore } from '../../state/store'
import {
  clampMapCamera,
  doubleClickZoomTarget,
  DOUBLE_CLICK_ZOOM_MS,
  initialMapCamera,
  isMapControl,
  MAX_MAP_ZOOM,
  minMapZoom,
  zoomMapAt,
  zoomTweenAt,
  type MapCamera,
  type MapCommand,
} from './camera-controls'

interface Props {
  worldW: number
  worldH: number
  containerW: number
  containerH: number
  containerEl: HTMLDivElement | null
  cameraStateRef: MutableRefObject<MapCamera>
  commandRef: MutableRefObject<MapCommand | null>
  followTarget: { x: number; y: number } | null
  /** A god tool is armed: a double-click paints twice rather than zooming. */
  toolArmed?: boolean
}
export function CanvasCameraController({
  worldW,
  worldH,
  containerW,
  containerH,
  containerEl,
  cameraStateRef,
  commandRef,
  followTarget,
  toolArmed = false,
}: Props) {
  const initialized = useRef(false)
  const toolArmedRef = useRef(toolArmed)
  toolArmedRef.current = toolArmed
  // A double-click zoom in progress: where it started, where it is going, and the point it closes in on.
  // Any other camera action (drag, wheel, pinch, keys, a fit or focus request) takes over from it.
  const tween = useRef<{
    from: MapCamera
    to: number
    point: { x: number; y: number }
    start: number
  } | null>(null)
  const previousFollow = useRef(false)
  const minZoom = minMapZoom({ w: worldW, h: worldH }, { w: containerW, h: containerH })
  const apply = (next: MapCamera) => {
    const bounded = clampMapCamera(next, { w: worldW, h: worldH }, { w: containerW, h: containerH })
    cameraStateRef.current = bounded
  }
  const applyRef = useRef(apply)
  applyRef.current = apply

  useEffect(() => {
    const opening = initialMapCamera({ w: worldW, h: worldH }, { w: containerW, h: containerH })
    // Wait for the viewport to be measured; this effect runs again when it is.
    if (!opening) return
    if (!initialized.current) {
      initialized.current = true
      applyRef.current(opening)
    } else applyRef.current(cameraStateRef.current)
  }, [worldW, worldH, containerW, containerH, cameraStateRef])

  useEffect(() => {
    if (followTarget)
      applyRef.current({ ...followTarget, zoom: previousFollow.current ? cameraStateRef.current.zoom : 3.5 })
    previousFollow.current = !!followTarget
  }, [followTarget, cameraStateRef])

  useEffect(() => {
    if (!containerEl) return
    let drag: { px: number; py: number; camera: MapCamera; id: number } | null = null
    // A double-click zoom in progress: where it started, where it is going, and the point it closes in on.
    const keys = new Set<string>()
    const stopFollow = () => {
      const ui = useUIStore.getState()
      if (ui.followOrgId) ui.followOrg(null)
    }
    const zoom = (factor: number, point = { x: containerW / 2, y: containerH / 2 }) => {
      tween.current = null
      const current = cameraStateRef.current
      const next = Math.max(minZoom, Math.min(MAX_MAP_ZOOM, current.zoom * factor))
      applyRef.current(zoomMapAt(current, next, point, { w: containerW, h: containerH }))
    }
    const onDown = (e: PointerEvent) => {
      if (isMapControl(e.target) || (e.button !== 0 && e.button !== 1)) return
      if (drag) {
        drag = null
        return
      }
      tween.current = null
      drag = { px: e.clientX, py: e.clientY, camera: { ...cameraStateRef.current }, id: e.pointerId }
      containerEl.focus({ preventScroll: true })
    }
    const onMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return
      const dx = e.clientX - drag.px,
        dy = e.clientY - drag.py
      if (dx * dx + dy * dy < 36) return
      stopFollow()
      applyRef.current({
        ...drag.camera,
        x: drag.camera.x - dx / drag.camera.zoom,
        y: drag.camera.y - dy / drag.camera.zoom,
      })
    }
    const onUp = () => {
      drag = null
    }
    const onDoubleClick = (e: MouseEvent) => {
      if (isMapControl(e.target) || toolArmedRef.current || e.button !== 0) return
      e.preventDefault()
      const rect = containerEl.getBoundingClientRect()
      const from = cameraStateRef.current
      const to = doubleClickZoomTarget(from.zoom, e.shiftKey, minZoom, MAX_MAP_ZOOM)
      // The player took the camera even when it is already at the limit: the follow ends either way.
      stopFollow()
      if (to === from.zoom) return
      tween.current = {
        from: { ...from },
        to,
        point: { x: e.clientX - rect.left, y: e.clientY - rect.top },
        start: performance.now(),
      }
    }
    const onWheel = (e: WheelEvent) => {
      if (isMapControl(e.target)) return
      e.preventDefault()
      tween.current = null
      const rect = containerEl.getBoundingClientRect()
      const delta = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? containerH : 1)
      stopFollow()
      zoom(Math.exp(-Math.max(-160, Math.min(160, delta)) * 0.0025), {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      })
    }
    const onKey = (e: KeyboardEvent) => {
      if (
        isMapControl(e.target) ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        !containerEl.contains(document.activeElement)
      )
        return
      const key = e.key.toLowerCase()
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(key)) {
        e.preventDefault()
        stopFollow()
        tween.current = null
        keys.add(key)
      } else if (key === '+' || key === '=') {
        e.preventDefault()
        zoom(1.2)
      } else if (key === '-') {
        e.preventDefault()
        zoom(1 / 1.2)
      } else if (key === '0') {
        e.preventDefault()
        commandRef.current = { kind: 'fit' }
      }
    }
    const keyUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase())
    const reset = () => {
      keys.clear()
      drag = null
      tween.current = null
    }
    let raf = 0,
      last = performance.now()
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (tween.current) {
        const zooming = tween.current
        const elapsed = now - zooming.start
        const viewport = { w: containerW, h: containerH }
        applyRef.current(
          zoomMapAt(
            zooming.from,
            zoomTweenAt(zooming.from.zoom, zooming.to, elapsed),
            zooming.point,
            viewport,
          ),
        )
        if (elapsed >= DOUBLE_CLICK_ZOOM_MS) tween.current = null
      }
      const command = commandRef.current
      if (command) {
        commandRef.current = null
        stopFollow()
        tween.current = null
        if (command.kind === 'fit') {
          const opening = initialMapCamera({ w: worldW, h: worldH }, { w: containerW, h: containerH })
          if (opening) applyRef.current(opening)
        } else if (command.kind === 'zoom') zoom(command.factor)
        else applyRef.current({ x: command.x, y: command.y, zoom: Math.max(cameraStateRef.current.zoom, 2) })
      }
      if (keys.size && document.activeElement === containerEl) {
        const x =
          Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'))
        const y =
          Number(keys.has('s') || keys.has('arrowdown')) - Number(keys.has('w') || keys.has('arrowup'))
        const step = (480 * dt) / cameraStateRef.current.zoom / (Math.hypot(x, y) || 1)
        applyRef.current({
          ...cameraStateRef.current,
          x: cameraStateRef.current.x + x * step,
          y: cameraStateRef.current.y + y * step,
        })
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    containerEl.addEventListener('pointerdown', onDown)
    containerEl.addEventListener('wheel', onWheel, { passive: false })
    containerEl.addEventListener('dblclick', onDoubleClick)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', reset)
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', keyUp)
    window.addEventListener('blur', reset)
    return () => {
      cancelAnimationFrame(raf)
      containerEl.removeEventListener('pointerdown', onDown)
      containerEl.removeEventListener('wheel', onWheel)
      containerEl.removeEventListener('dblclick', onDoubleClick)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', reset)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', keyUp)
      window.removeEventListener('blur', reset)
    }
  }, [cameraStateRef, commandRef, containerEl, containerW, containerH, minZoom, worldW, worldH])

  useEffect(() => {
    if (!containerEl) return
    let distance = 0
    const pinch = (e: TouchEvent) => {
      if (e.touches.length !== 2 || isMapControl(e.target)) {
        distance = 0
        return
      }
      e.preventDefault()
      tween.current = null
      const [a, b] = [e.touches[0], e.touches[1]]
      const next = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
      if (distance > 0 && next > 0) {
        const current = cameraStateRef.current
        const rect = containerEl.getBoundingClientRect()
        useUIStore.getState().followOrg(null)
        applyRef.current(
          zoomMapAt(
            current,
            Math.max(minZoom, Math.min(MAX_MAP_ZOOM, (current.zoom * next) / distance)),
            { x: (a.clientX + b.clientX) / 2 - rect.left, y: (a.clientY + b.clientY) / 2 - rect.top },
            { w: containerW, h: containerH },
          ),
        )
      }
      distance = next
    }
    const reset = () => {
      distance = 0
    }
    containerEl.addEventListener('touchstart', pinch, { passive: false })
    containerEl.addEventListener('touchmove', pinch, { passive: false })
    containerEl.addEventListener('touchend', reset)
    containerEl.addEventListener('touchcancel', reset)
    return () => {
      containerEl.removeEventListener('touchstart', pinch)
      containerEl.removeEventListener('touchmove', pinch)
      containerEl.removeEventListener('touchend', reset)
      containerEl.removeEventListener('touchcancel', reset)
    }
  }, [containerEl, cameraStateRef, minZoom, containerW, containerH])
  return null
}
