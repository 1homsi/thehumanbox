import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { StatsOverlay, useGame } from 'cubeforge'
import type { WorldState } from '../../../../shared/types'
import type { InterpRefs } from '../../../../simulation/useSimulation'
import type { ViewFlags } from '../../../../state/store'
import { LOW_PERF } from '../../../../shared/perf'
import { interpolationFactor, shouldRenderFrame } from '../../render-timing'
import { prayerEffectsActive } from '../../prayer-feedback'
import { worldMomentsActive } from '../../world-moments'
import { peopleLabelSource } from '../picking'
import { makeFrame } from './frame'
import { engineRenderHost } from './host'
import { CfOverlayRenderer } from './renderer'

interface Props {
  world: WorldState
  interp?: InterpRefs
  selectedOrgId: string | null
  overlay: string | null
  focus: string
  viewFlags: ViewFlags
  rendererPaused: boolean
  cameraStateRef: React.MutableRefObject<{ x: number; y: number; zoom: number }>
  viewportDims: { w: number; h: number }
  /** Called with each frame's timings (tests and the optional stats readout). */
  onUpdate?: (result: CfOverlayRenderer['lastResult']) => void
  /** Hands the renderer to a test, which drives `update()` itself. */
  onRenderer?: (renderer: CfOverlayRenderer | null) => void
}

const lerpCycle = (a: number, b: number, k: number) => {
  let diff = b - a
  if (diff > 0.5) diff -= 1
  if (diff < -0.5) diff += 1
  return (((a + diff * k) % 1) + 1) % 1
}

/**
 * Everything on the map that is not a tile, a plant or a person: weather and day/night light, heat
 * maps and territory, roads and rails, battles, wards, labels, prayers, and the name tags above
 * the people. Mounted inside the same `<World>` as the other layers.
 */
export function CfOverlays({
  world,
  interp,
  selectedOrgId,
  overlay,
  focus,
  viewFlags,
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
  const selectedRef = useRef(selectedOrgId)
  const overlayRef = useRef(overlay)
  const focusRef = useRef(focus)
  const viewFlagsRef = useRef(viewFlags)
  const onUpdateRef = useRef(onUpdate)
  const cachedDepth = useRef<number[][] | undefined>(undefined)
  const cachedBiomes = useRef<number[][] | undefined>(undefined)
  worldRef.current = world
  selectedRef.current = selectedOrgId
  overlayRef.current = overlay
  focusRef.current = focus
  viewFlagsRef.current = viewFlags
  onUpdateRef.current = onUpdate

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
      if (cur.grid.depth_map) cachedDepth.current = cur.grid.depth_map as number[][]
      if (cur.grid.biomes) cachedBiomes.current = cur.grid.biomes as number[][]
      const cam = cameraStateRef.current
      const prev = interp?.prev.current
      const curServerAt = interp?.currentServerAt.current ?? 0
      const prevServerAt = interp?.prevServerAt.current ?? 0
      const receivedAt = interp?.currentReceivedAt.current ?? 0
      const interval = Math.max(50, curServerAt - prevServerAt)
      const k = interp && cur && prev ? interpolationFactor(now, receivedAt, interval) : 1
      // A settled map (no new frame, still camera, nobody selected moving) stops repainting.
      const key = `${curServerAt}|${cam.x}|${cam.y}|${cam.zoom}|${overlayRef.current ?? ''}|${focusRef.current}|${selectedRef.current ?? ''}|${JSON.stringify(viewFlagsRef.current)}|${viewportDims.w}x${viewportDims.h}`
      const settled = key === lastKey && !prayerEffectsActive() && !worldMomentsActive()
      if (interp && settled && now - receivedAt > interval + 160) return
      lastFrameAt = now
      lastKey = key
      const grid =
        cachedDepth.current || cachedBiomes.current
          ? {
              ...cur.grid,
              depth_map: cachedDepth.current ?? cur.grid.depth_map,
              biomes: cachedBiomes.current ?? cur.grid.biomes,
            }
          : cur.grid
      const enriched: WorldState = {
        ...cur,
        grid,
        day_progress: prev ? lerpCycle(prev.day_progress, cur.day_progress, k) : cur.day_progress,
        season_progress: prev ? lerpCycle(prev.season_progress, cur.season_progress, k) : cur.season_progress,
      }
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
        { people: peopleLabelSource(), selectedId: selectedRef.current },
      )
      onUpdateRef.current?.(result)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      stopped = true
      cancelAnimationFrame(raf)
    }
  }, [renderer, rendererPaused, interp, cameraStateRef, viewportDims])

  return viewFlags.fps ? <StatsOverlay corner="top-right" /> : null
}
