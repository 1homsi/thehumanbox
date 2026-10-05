import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { StatsOverlay, TileLayer, useGame } from 'cubeforge'
import type { WorldState } from '../../../../shared/types'
import type { InterpRefs } from '../../../../simulation/useSimulation'
import type { ViewFlags } from '../../../../state/store'
import { LOW_PERF } from '../../../../shared/perf'
import { interpolationFactor, shouldRenderFrame } from '../../render-timing'
import { prayerEffectsActive } from '../../prayer-feedback'
import { worldMomentsActive } from '../../world-moments'
import { makeFrame } from './frame'
import { engineRenderHost } from './host'
import type { CfFeatures } from './features'
import { CfOverlayRenderer } from './renderer'
import { setCfActive } from '../active'

interface Props {
  world: WorldState
  interp?: InterpRefs
  overlay: string | null
  focus: string
  viewFlags: ViewFlags
  features: CfFeatures
  rendererPaused: boolean
  cameraStateRef: React.MutableRefObject<{ x: number; y: number; zoom: number }>
  viewportDims: { w: number; h: number }
  /** Called with each frame's timings (the benchmark and the optional stats readout). */
  onUpdate?: (result: CfOverlayRenderer['lastResult']) => void
  /** Hands the renderer to the benchmark, which drives `update()` itself. */
  onRenderer?: (renderer: CfOverlayRenderer | null) => void
}

const lerpCycle = (a: number, b: number, k: number) => {
  let diff = b - a
  if (diff > 0.5) diff -= 1
  if (diff < -0.5) diff += 1
  return (((a + diff * k) % 1) + 1) % 1
}

/**
 * The non-sprite world visuals (weather and day/night light, heat maps, territory, battles,
 * wards, labels, prayers ...) as cubeforge layers, mounted inside the same `<World>` as the map
 * sprite. Everything is behind `features`, so with all of them off this renders nothing.
 */
export function CfOverlays({
  world,
  interp,
  overlay,
  focus,
  viewFlags,
  features,
  rendererPaused,
  cameraStateRef,
  viewportDims,
  onUpdate,
  onRenderer,
}: Props) {
  const engine = useGame()
  const gw = world.grid.width
  const gh = world.grid.height
  const [renderer, setRenderer] = useState<CfOverlayRenderer | null>(null)
  const onRendererRef = useRef(onRenderer)
  onRendererRef.current = onRenderer

  useLayoutEffect(() => {
    const r = new CfOverlayRenderer(engineRenderHost(engine), gw, gh)
    setRenderer(r)
    onRendererRef.current?.(r)
    return () => {
      onRendererRef.current?.(null)
      r.dispose()
      setRenderer(null)
    }
  }, [engine, gw, gh])

  const worldRef = useRef(world)
  const overlayRef = useRef(overlay)
  const focusRef = useRef(focus)
  const viewFlagsRef = useRef(viewFlags)
  const onUpdateRef = useRef(onUpdate)
  worldRef.current = world
  overlayRef.current = overlay
  focusRef.current = focus
  viewFlagsRef.current = viewFlags
  onUpdateRef.current = onUpdate

  useEffect(() => {
    if (!renderer) return
    renderer.features = features
    // Tell the canvas painters which of their layers this renderer has taken over.
    const names = (Object.keys(features) as (keyof CfFeatures)[]).filter((k) => features[k] === true)
    setCfActive(names)
    return () => setCfActive([])
  }, [renderer, features])

  useEffect(() => {
    if (!renderer || rendererPaused) return
    let raf = 0
    let stopped = false
    let lastFrameAt = -Infinity
    let lastKey = ''
    const tick = (now: number) => {
      if (stopped) return
      raf = requestAnimationFrame(tick)
      if (document.hidden || !shouldRenderFrame(now, lastFrameAt, LOW_PERF ? 24 : 30)) return
      const cur = interp?.current.current ?? worldRef.current
      if (!cur) return
      const cam = cameraStateRef.current
      const prev = interp?.prev.current
      const curServerAt = interp?.currentServerAt.current ?? 0
      const prevServerAt = interp?.prevServerAt.current ?? 0
      const receivedAt = interp?.currentReceivedAt.current ?? 0
      const interval = Math.max(50, curServerAt - prevServerAt)
      const k = interp && cur && prev ? interpolationFactor(now, receivedAt, interval) : 1
      // Same rule as the canvas painter: a settled map (no new frame, still camera) stops repainting.
      const key = `${curServerAt}|${cam.x}|${cam.y}|${cam.zoom}|${overlayRef.current ?? ''}|${focusRef.current}|${JSON.stringify(viewFlagsRef.current)}|${viewportDims.w}x${viewportDims.h}`
      const settled = key === lastKey && !prayerEffectsActive() && !worldMomentsActive()
      if (interp && settled && now - receivedAt > interval + 160) return
      lastFrameAt = now
      lastKey = key
      const enriched: WorldState = prev
        ? {
            ...cur,
            day_progress: lerpCycle(prev.day_progress, cur.day_progress, k),
            season_progress: lerpCycle(prev.season_progress, cur.season_progress, k),
          }
        : cur
      const result = renderer.update(
        makeFrame({
          world: enriched,
          t: Date.now(),
          zoom: cam.zoom,
          cam,
          viewport: viewportDims,
          dpr: window.devicePixelRatio || 1,
          overlay: overlayRef.current,
          focus: focusRef.current,
          viewFlags: viewFlagsRef.current,
        }),
      )
      onUpdateRef.current?.(result)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      stopped = true
      cancelAnimationFrame(raf)
    }
  }, [renderer, rendererPaused, interp, cameraStateRef, viewportDims])

  if (!renderer) return null
  const { heat, contested, outline } = renderer.tileLayers
  return (
    <>
      {features.overlays && (
        <>
          <TileLayer layer={heat} />
          <TileLayer layer={contested} />
          <TileLayer layer={outline} />
        </>
      )}
      {features.hud && viewFlags.fps && <StatsOverlay corner="top-right" />}
    </>
  )
}
