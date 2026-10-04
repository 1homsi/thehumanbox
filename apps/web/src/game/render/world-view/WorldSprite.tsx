import type { AnimalInterpCache, OrgInterpCache } from '../draw-helpers'
import { worldRenderScale, worldRenderWindow, interpolationFactor, shouldRenderFrame } from '../render-timing'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Transform, Sprite, useEntity, useGame, useDynamicCanvas } from 'cubeforge'
import type { WorldState } from '../../../shared/types'
import type { InterpRefs } from '../../../simulation/useSimulation'
import type { ViewFlags } from '../../../state/store'
import { worldMomentsActive } from '../world-moments'
import { prayerEffectsActive } from '../prayer-feedback'
import { LOW_PERF } from '../../../shared/perf'
import { logger } from '../../../shared/logger'
import { zoomDetailLevel } from '../character-visuals'
import { TILE } from '../../model/palette'
import { paintWorldTexture } from './paint-texture'

export function WorldSprite({
  world,
  interp,
  selectedOrgId,
  overlay,
  focus,
  viewFlags,
  rendererPaused,
  onFirstDraw,
  onDrawError,
  atX,
  atY,
  cameraStateRef,
  viewportDims,
}: {
  world: WorldState
  interp?: InterpRefs
  selectedOrgId: string | null
  overlay: string | null
  focus: string
  viewFlags: ViewFlags
  rendererPaused: boolean
  onFirstDraw: () => void
  onDrawError: (message: string) => void
  atX: number
  atY: number
  cameraStateRef?: React.MutableRefObject<{ x: number; y: number; zoom: number }>
  viewportDims?: { w: number; h: number }
}) {
  const entityId = useEntity()
  const engine = useGame()

  const W = world.grid.width * TILE
  const H = world.grid.height * TILE
  const [renderScale, setRenderScale] = useState(() =>
    worldRenderScale(
      viewportDims ? Math.min(viewportDims.w / W, viewportDims.h / H) * 0.95 : 1,
      window.devicePixelRatio || 1,
      LOW_PERF,
    ),
  )
  const [renderWindow, setRenderWindow] = useState(() =>
    cameraStateRef && viewportDims
      ? worldRenderWindow(W, H, cameraStateRef.current, viewportDims)
      : { x: 0, y: 0, width: W, height: H },
  )
  const renderScaleRef = useRef(renderScale)
  const zoomActivity = useRef({ zoom: 0, changedAt: 0 })
  // Even dimensions keep the pixel-art grid aligned when scaled.
  const dynW = Math.max(TILE, Math.round((renderWindow.width * renderScale) / 2) * 2)
  const dynH = Math.max(TILE, Math.round((renderWindow.height * renderScale) / 2) * 2)
  const dyn = useDynamicCanvas(dynW, dynH)

  const hasDrawn = useRef(false)
  const cachedDepth = useRef<number[][] | null>(null)
  const cachedBiomes = useRef<number[][] | null>(null)
  const filledDynId = useRef<string | null>(null)
  const orgInterpCache = useRef<OrgInterpCache>({
    source: null,
    prevSource: null,
    frameId: -1,
    items: [],
    prevById: new Map(),
  })
  const animalInterpCache = useRef<AnimalInterpCache>({
    source: null,
    prevSource: null,
    frameId: -1,
    items: [],
    prevById: new Map(),
  })

  useLayoutEffect(() => {
    if (filledDynId.current === dyn.id) return
    filledDynId.current = dyn.id
    dyn.ctx.fillStyle = '#1a4a80'
    dyn.ctx.fillRect(0, 0, dynW, dynH)
    dyn.markDirty()
  }, [dyn, dynW, dynH])

  const worldRef = useRef<WorldState | null>(world)
  const selectedOrgIdRef = useRef<string | null>(selectedOrgId)
  const overlayRef = useRef<string | null>(overlay)
  const focusRef = useRef<string>(focus)
  const viewFlagsRef = useRef<ViewFlags>(viewFlags)
  worldRef.current = world
  selectedOrgIdRef.current = selectedOrgId
  overlayRef.current = overlay
  focusRef.current = focus
  viewFlagsRef.current = viewFlags

  // A window/scale change can allocate a new canvas and move the Cubeforge
  // sprite in the same React commit. Paint that canvas and update its ECS
  // geometry before the renderer can display the new placement. Otherwise a
  // zoom-out briefly stretches the old window into the new one, and a pan
  // displays old pixels at the new coordinates until the next 30fps tick.
  useLayoutEffect(() => {
    const w = interp?.current.current ?? worldRef.current
    if (!w) return
    const grid = {
      ...w.grid,
      depth_map: cachedDepth.current ?? w.grid.depth_map,
      biomes: cachedBiomes.current ?? w.grid.biomes,
    }
    const zoom = cameraStateRef?.current.zoom ?? 1
    paintWorldTexture(
      dyn.ctx,
      { ...w, grid },
      selectedOrgIdRef.current,
      overlayRef.current,
      focusRef.current,
      viewFlagsRef.current,
      renderWindow,
      zoom,
      renderScale,
    )
    const sprite = engine.ecs.getComponent(entityId, 'Sprite')
    if (sprite) {
      sprite.width = renderWindow.width
      sprite.height = renderWindow.height
    }
    const transform = engine.ecs.getComponent(entityId, 'Transform')
    if (transform) {
      transform.x = atX - W / 2 + renderWindow.x + renderWindow.width / 2
      transform.y = atY - H / 2 + renderWindow.y + renderWindow.height / 2
    }
    dyn.markDirty()
    if (!interp && !hasDrawn.current) {
      hasDrawn.current = true
      requestAnimationFrame(() => requestAnimationFrame(onFirstDraw))
    }
  }, [dyn, engine, entityId, interp, cameraStateRef, renderWindow, renderScale, atX, atY, W, H, onFirstDraw])

  useEffect(() => {
    if (!interp || rendererPaused) return
    let raf = 0
    let stopped = false
    let lastDrawnAt: number = 0
    let lastDrawnT: number = -1
    let lastDrawnUI: string = ''
    let lastFrameAt = -Infinity

    const tick = (now: number) => {
      if (stopped) return
      raf = requestAnimationFrame(tick)

      if (document.hidden || !shouldRenderFrame(now, lastFrameAt, LOW_PERF ? 24 : 30)) return
      lastFrameAt = now

      const w = interp.current.current ?? worldRef.current
      if (!w) return

      if (w.grid.depth_map) cachedDepth.current = w.grid.depth_map as number[][]
      if (w.grid.biomes) cachedBiomes.current = w.grid.biomes as number[][]

      const cur = interp.current.current
      const prev = interp.prev.current
      const curServerAt = interp.currentServerAt.current
      const prevServerAt = interp.prevServerAt.current
      const currentReceivedAt = interp.currentReceivedAt.current
      const interval = Math.max(50, curServerAt - prevServerAt)
      // Never extrapolate beyond the last known position: delayed frames
      // used to overshoot and snap people backwards, looking like pacing.
      const PREDICT_CAP = 1.0
      const t = cur && prev ? interpolationFactor(now, currentReceivedAt, interval) : 1

      const renderZoom = cameraStateRef?.current.zoom ?? 1
      // Adapt canvas resolution to the camera: zoomed-out views need a
      // fraction of the world-sized bitmap, so skip uploading pixels the
      // screen can't display anyway.
      const targetScale = worldRenderScale(renderZoom, window.devicePixelRatio || 1, LOW_PERF)
      if (zoomActivity.current.zoom !== renderZoom) {
        zoomActivity.current = { zoom: renderZoom, changedAt: now }
      }
      if (targetScale !== renderScaleRef.current && now - zoomActivity.current.changedAt >= 150) {
        renderScaleRef.current = targetScale
        setRenderScale(targetScale)
      }
      if (cameraStateRef && viewportDims) {
        const nextWindow = worldRenderWindow(W, H, cameraStateRef.current, viewportDims, renderWindow)
        if (
          nextWindow.x !== renderWindow.x ||
          nextWindow.y !== renderWindow.y ||
          nextWindow.width !== renderWindow.width ||
          nextWindow.height !== renderWindow.height
        ) {
          setRenderWindow(nextWindow)
          return
        }
      }
      const detailBucket = zoomDetailLevel(renderZoom)
      const uiKey = `${selectedOrgIdRef.current ?? ''}|${overlayRef.current ?? ''}|${focusRef.current}|${JSON.stringify(viewFlagsRef.current)}|${detailBucket}|${renderScale}|${renderWindow.x}|${renderWindow.y}`
      const settled =
        t >= PREDICT_CAP &&
        lastDrawnT >= PREDICT_CAP &&
        curServerAt === lastDrawnAt &&
        uiKey === lastDrawnUI &&
        !prayerEffectsActive() &&
        !worldMomentsActive()
      // Give the last walking pose time to settle before freezing a quiet map.
      // Otherwise the last rendered footstep remains stuck indefinitely.
      if (settled && now - currentReceivedAt > interval + 160) return

      let renderOrgs = w.viewport_organisms ?? w.organisms
      if (prev && cur === w) {
        const prevOrgs = prev.viewport_organisms ?? prev.organisms
        const cache = orgInterpCache.current
        if (cache.prevSource !== prevOrgs) {
          cache.prevSource = prevOrgs
          cache.prevById.clear()
          for (const o of prevOrgs) cache.prevById.set(o.id, o)
        }
        if (cache.source !== renderOrgs || cache.frameId !== w.frame_id) {
          cache.source = renderOrgs
          cache.frameId = w.frame_id
          cache.items = renderOrgs.map((o) => ({ ...o }))
        }
        const items = cache.items
        for (let i = 0; i < renderOrgs.length; i++) {
          const o = renderOrgs[i]
          const out = items[i]
          const p = cache.prevById.get(o.id)
          if (p && p.alive && o.alive) {
            out.x = p.x + (o.x - p.x) * t
            out.y = p.y + (o.y - p.y) * t
          } else {
            out.x = o.x
            out.y = o.y
          }
        }
        renderOrgs = items
      }
      let renderAnimals = w.viewport_animals ?? w.animals
      if (prev && cur === w) {
        const prevAnimals = prev.viewport_animals ?? prev.animals
        const cache = animalInterpCache.current
        if (cache.prevSource !== prevAnimals) {
          cache.prevSource = prevAnimals
          cache.prevById.clear()
          for (const a of prevAnimals) cache.prevById.set(a.id, a)
        }
        if (cache.source !== renderAnimals || cache.frameId !== w.frame_id) {
          cache.source = renderAnimals
          cache.frameId = w.frame_id
          cache.items = renderAnimals.map((a) => ({ ...a }))
        }
        const items = cache.items
        for (let i = 0; i < renderAnimals.length; i++) {
          const a = renderAnimals[i]
          const out = items[i]
          const p = cache.prevById.get(a.id)
          if (p) {
            out.x = p.x + (a.x - p.x) * t
            out.y = p.y + (a.y - p.y) * t
          } else {
            out.x = a.x
            out.y = a.y
          }
        }
        renderAnimals = items
      }

      const lerpCycle = (a: number, b: number, k: number) => {
        let diff = b - a
        if (diff > 0.5) diff -= 1
        if (diff < -0.5) diff += 1
        const out = a + diff * k
        return ((out % 1) + 1) % 1
      }
      const lerpedDay = prev ? lerpCycle(prev.day_progress, w.day_progress, t) : w.day_progress
      const lerpedSeason = prev ? lerpCycle(prev.season_progress, w.season_progress, t) : w.season_progress

      const enrichedGrid = {
        ...w.grid,
        depth_map: cachedDepth.current ?? w.grid.depth_map,
        biomes: cachedBiomes.current ?? w.grid.biomes,
      }
      const enrichedWorld: WorldState = {
        ...w,
        grid: enrichedGrid,
        viewport_organisms: renderOrgs,
        viewport_animals: renderAnimals,
        day_progress: lerpedDay,
        season_progress: lerpedSeason,
      }

      // Paint the entire padded texture, so camera movement within it never
      // exposes culled strips or requires an extra CPU redraw.
      try {
        paintWorldTexture(
          dyn.ctx,
          enrichedWorld,
          selectedOrgIdRef.current,
          overlayRef.current,
          focusRef.current,
          viewFlagsRef.current,
          renderWindow,
          renderZoom,
          renderScale,
        )
      } catch (error) {
        stopped = true
        cancelAnimationFrame(raf)
        logger.error('2d-world', 'GPU world drawing failed', error)
        onDrawError('The world could not be drawn. Retry the renderer to restore the map.')
        return
      }
      dyn.markDirty()

      lastDrawnAt = curServerAt
      lastDrawnT = t
      lastDrawnUI = uiKey

      if (!hasDrawn.current) {
        hasDrawn.current = true
        requestAnimationFrame(() => requestAnimationFrame(onFirstDraw))
      }
    }

    raf = requestAnimationFrame(tick)
    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      // NOTE: deliberately do NOT reset the module-level terrain caches
      // (_baseCanvas/_baseKey/_tileDecor/_waterFx/...) here. They are
      // keyed by world-data identity and invalidate themselves when the
      // grid changes. This effect re-runs whenever any dep identity
      // changes (e.g. a new interp wrapper or viewport measure), and
      // wiping the caches here used to force a full 11.5M-pixel base
      // rebuild several times per second - the single biggest source of
      // frame stalls in the whole app.
    }
  }, [
    interp,
    dyn,
    onFirstDraw,
    onDrawError,
    cameraStateRef,
    viewportDims,
    rendererPaused,
    renderScale,
    renderWindow,
    W,
    H,
  ])

  return (
    <>
      <Transform
        x={atX - W / 2 + renderWindow.x + renderWindow.width / 2}
        y={atY - H / 2 + renderWindow.y + renderWindow.height / 2}
      />
      {/* Geometry is synchronized with the painted texture before each handoff. */}
      <Sprite
        width={renderWindow.width}
        height={renderWindow.height}
        dynamicSrc={dyn.id}
        color="#ffffff"
        zIndex={0}
      />
    </>
  )
}
