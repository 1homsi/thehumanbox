import { useEffect, useRef, type MutableRefObject } from 'react'
import { Entity, Script, useCamera, useCameraPanZoom, useGame } from 'xipjs'
import { useUIStore } from '../../../../state/store'
import {
  clampMapCamera,
  initialMapCamera,
  isMapControl,
  MAX_MAP_ZOOM,
  minMapZoom,
  zoomMapAt,
  type MapCamera,
  type MapCommand,
} from '../../camera-controls'
import { wakeRenderLoops } from '../render-loop'
import { KEY_ZOOM_STEP, WHEEL_SPEED, commandCamera, keyboardPanDelta, panKey } from './camera-rig'

interface Props {
  worldW: number
  worldH: number
  containerW: number
  containerH: number
  containerEl: HTMLDivElement | null
  /** The camera the rest of the map reads (HUD, sprite window, hit tests). Kept in step with Camera2D. */
  cameraStateRef: MutableRefObject<MapCamera>
  commandRef: MutableRefObject<MapCommand | null>
  followTarget: { x: number; y: number } | null
  /** A press released without dragging: map point and container point. Primary button only. */
  onTap?: (tap: { worldX: number; worldY: number; screenX: number; screenY: number }) => void
}

interface CameraLike {
  x: number
  y: number
  zoom: number
}

/**
 * The map camera on xipjs: `useCameraPanZoom` does the pointer work (mouse
 * and touch pan, wheel and pinch zoom around the cursor or fingers, tap
 * detection) and the Camera2D entity is the one camera. This component adds
 * what the engine does not have: keeping the camera inside the world, the
 * "fit", "focus" and "follow" requests, keyboard panning, and stopping a
 * follow when the player takes the camera.
 *
 * Every frame a script (which runs before the renderer) takes the camera as
 * the engine left it, clamps it with the same `clampMapCamera` the 2D
 * fallback uses, writes it back, and copies it to `cameraStateRef`.
 */
export function CfMapCameraController({
  worldW,
  worldH,
  containerW,
  containerH,
  containerEl,
  cameraStateRef,
  commandRef,
  followTarget,
  onTap,
}: Props) {
  const engine = useGame()
  const camera = useCamera()
  const world = { w: worldW, h: worldH }
  const viewport = { w: containerW, h: containerH }
  const minZoom = minMapZoom(world, viewport)

  const tapRef = useRef(onTap)
  tapRef.current = onTap
  useCameraPanZoom({
    minZoom,
    maxZoom: MAX_MAP_ZOOM,
    wheelSpeed: WHEEL_SPEED,
    // The map has never glided after a drag.
    inertia: false,
    dragThreshold: 6,
    buttons: [0, 1],
    onTap: (e) => {
      if (e.button === 0) tapRef.current?.(e)
    },
  })

  // The camera as this controller last left it. Anything else seen on the
  // Camera2D component was written by the engine's input: the player took it.
  const last = useRef<CameraLike | null>(null)
  const initialized = useRef(false)
  const previousFollow = useRef(false)
  const keys = useRef(new Set<string>())
  const lastFrameAt = useRef(0)

  const stopFollow = () => {
    const ui = useUIStore.getState()
    if (ui.followOrgId) ui.followOrg(null)
  }
  /** Put the camera there (clamped), without waking the loop: for use inside a frame. */
  const commit = (next: MapCamera) => {
    const bounded = clampMapCamera(next, world, viewport)
    camera.setZoom(bounded.zoom)
    camera.setPosition(bounded.x, bounded.y)
    last.current = { ...bounded }
    const before = cameraStateRef.current
    cameraStateRef.current = bounded
    // The render loops sleep while the world is still: a moved camera wakes them.
    if (before.x !== bounded.x || before.y !== bounded.y || before.zoom !== bounded.zoom) wakeRenderLoops()
  }
  /** Same, from an event: the sleeping loop is woken to draw it. */
  const apply = (next: MapCamera) => {
    commit(next)
    engine.loop.markDirty()
  }
  const zoomBy = (factor: number, point = { x: containerW / 2, y: containerH / 2 }) => {
    const current = cameraStateRef.current
    const next = Math.max(minZoom, Math.min(MAX_MAP_ZOOM, current.zoom * factor))
    apply(zoomMapAt(current, next, point, viewport))
  }
  const applyRef = useRef(apply)
  applyRef.current = apply
  const commitRef = useRef(commit)
  commitRef.current = commit
  const zoomRef = useRef(zoomBy)
  zoomRef.current = zoomBy
  const stopFollowRef = useRef(stopFollow)
  stopFollowRef.current = stopFollow

  useEffect(() => {
    if (initialized.current && followTarget)
      applyRef.current({ ...followTarget, zoom: previousFollow.current ? cameraStateRef.current.zoom : 3.5 })
    previousFollow.current = !!followTarget
  }, [followTarget, cameraStateRef])

  // A new viewport or world: draw once so the camera is clamped to it (the loop sleeps until woken).
  useEffect(() => {
    engine.loop.markDirty()
  }, [engine, containerW, containerH, worldW, worldH])

  // Requests ("fit", "focus") are dropped into `commandRef` by whoever asks.
  // The own camera polls it in its animation frame; the engine loop sleeps
  // between inputs, so make writing a request wake it.
  useEffect(() => {
    let pending = commandRef.current
    Object.defineProperty(commandRef, 'current', {
      configurable: true,
      get: () => pending,
      set: (value: MapCommand | null) => {
        pending = value
        if (value) engine.loop.markDirty()
      },
    })
    if (pending) engine.loop.markDirty()
    return () => {
      Object.defineProperty(commandRef, 'current', {
        configurable: true,
        writable: true,
        enumerable: true,
        value: pending,
      })
    }
  }, [commandRef, engine])

  useEffect(() => {
    if (!containerEl) return
    const pressed = keys.current
    const inMap = () => containerEl.contains(document.activeElement)
    const onKey = (e: KeyboardEvent) => {
      if (isMapControl(e.target) || e.ctrlKey || e.metaKey || e.altKey || !inMap()) return
      const key = e.key.toLowerCase()
      if (panKey(key)) {
        e.preventDefault()
        stopFollowRef.current()
        pressed.add(key)
        lastFrameAt.current = performance.now()
        engine.loop.markDirty()
      } else if (key === '+' || key === '=') {
        e.preventDefault()
        zoomRef.current(KEY_ZOOM_STEP)
      } else if (key === '-') {
        e.preventDefault()
        zoomRef.current(1 / KEY_ZOOM_STEP)
      } else if (key === '0') {
        e.preventDefault()
        commandRef.current = { kind: 'fit' }
        engine.loop.markDirty()
      }
    }
    const keyUp = (e: KeyboardEvent) => pressed.delete(e.key.toLowerCase())
    const reset = () => pressed.clear()
    const hidden = () => {
      if (document.hidden) pressed.clear()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', keyUp)
    window.addEventListener('blur', reset)
    document.addEventListener('visibilitychange', hidden)
    return () => {
      pressed.clear()
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', keyUp)
      window.removeEventListener('blur', reset)
      document.removeEventListener('visibilitychange', hidden)
    }
  }, [containerEl, commandRef, engine])

  // Runs every engine frame, before the renderer draws.
  const frame = () => {
    const opening = initialMapCamera(world, viewport)
    if (!opening) return
    if (!initialized.current) {
      initialized.current = true
      commitRef.current(opening)
      return
    }
    const live = camera.getPosition()
    const liveZoom = camera.getZoom()
    const seen = last.current
    if (seen && (live.x !== seen.x || live.y !== seen.y || liveZoom !== seen.zoom)) stopFollowRef.current()

    let next: MapCamera = { x: live.x, y: live.y, zoom: liveZoom }
    const command = commandRef.current
    if (command) {
      commandRef.current = null
      stopFollowRef.current()
      const target = commandCamera(command, next, world, viewport)
      if (target) next = target
    }
    const now = performance.now()
    if (keys.current.size && containerEl?.contains(document.activeElement)) {
      // The loop sleeps between inputs and steps a fixed 1/60 s: use real time.
      const dt = Math.min(0.05, (now - lastFrameAt.current) / 1000)
      const delta = keyboardPanDelta(keys.current, dt, next.zoom)
      next = { ...next, x: next.x + delta.x, y: next.y + delta.y }
      engine.loop.markDirty()
    }
    lastFrameAt.current = now
    commitRef.current(next)
  }
  const frameRef = useRef(frame)
  frameRef.current = frame

  return (
    <Entity>
      <Script update={() => frameRef.current()} />
    </Entity>
  )
}
