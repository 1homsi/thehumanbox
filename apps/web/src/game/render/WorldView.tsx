import { drawWorldOnCanvas } from './draw-world'
import type { AnimalInterpCache, OrgInterpCache } from './draw-helpers'

import { worldRenderScale, worldRenderWindow, interpolationFactor, shouldRenderFrame } from './render-timing'

import { MapCameraController } from './MapCameraController'
import { CanvasCameraController } from './CanvasCameraController'
import { World2DErrorBoundary } from './World2DErrorBoundary'
import { WorldMapHud } from './WorldMapHud'
import { SandboxBursts } from './SandboxBursts'
import { burstForTool, useSandboxBursts } from './sandbox-bursts'
import { isMapControl, type MapCommand } from './camera-controls'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Game,
  World,
  Entity,
  Transform,
  Sprite,
  Camera2D,
  useEntity,
  useGame,
  useDynamicCanvas,
  type GameControls,
} from 'cubeforge'
import type { PrayerInfo, WorldState } from '../../shared/types'
import type { InterpRefs } from '../../simulation/useSimulation'
import { useUIStore, type ViewFlags } from '../../state/store'

import { useSceneStore } from '../../state/scene'

import { worldMomentsActive } from './world-moments'
import { prayerAtPoint } from './prayer-bubbles'

import { prayerEffectsActive } from './prayer-feedback'

import { useCameraFocus } from '../../state/camera-focus'

import { TILE_ID, isWaterTile } from '../model/terrain-ids'

import { hasRuinedBuildingAtWorldTile } from '../model/building-state'
import { buildTerritoryIndex, lineageAtTerritoryTile } from '../model/territory'

import { LOW_PERF } from '../../shared/perf'
import { logger } from '../../shared/logger'
import { syncRendererLoopPause } from '../../shared/desktopVisibility'
import { zoomDetailLevel } from './character-visuals'
import { TILE } from '../model/palette'

function paintWorldTexture(
  ctx: CanvasRenderingContext2D,
  world: WorldState,
  selectedOrgId: string | null,
  overlay: string | null,
  focus: string,
  viewFlags: ViewFlags,
  renderWindow: ReturnType<typeof worldRenderWindow>,
  zoom: number,
  scale: number,
) {
  const bounds = {
    c0: Math.max(0, Math.floor(renderWindow.x / TILE)),
    c1: Math.min(world.grid.width, Math.ceil((renderWindow.x + renderWindow.width) / TILE)),
    r0: Math.max(0, Math.floor(renderWindow.y / TILE)),
    r1: Math.min(world.grid.height, Math.ceil((renderWindow.y + renderWindow.height) / TILE)),
  }
  ctx.setTransform(scale, 0, 0, scale, -renderWindow.x * scale, -renderWindow.y * scale)
  drawWorldOnCanvas(ctx, world, selectedOrgId, overlay, focus, viewFlags, bounds, zoom, scale)
}

function WorldSprite({
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

function canUseWorldGPU(): boolean {
  try {
    if (new URLSearchParams(window.location.search).get('renderer') === 'canvas') return false
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false })
    if (!gl) return false
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    return false
  }
}

function CanvasWorldFallback({
  world,
  interp,
  selectedOrgId,
  overlay,
  focus,
  viewFlags,
  rendererPaused,
  onFirstDraw,
  onDrawError,
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
  cameraStateRef: React.MutableRefObject<{ x: number; y: number; zoom: number }>
  viewportDims: { w: number; h: number }
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const hasDrawn = useRef(false)
  const cachedDepth = useRef<number[][] | null>(null)
  const cachedBiomes = useRef<number[][] | null>(null)
  const orgCache = useRef<OrgInterpCache>({
    source: null,
    prevSource: null,
    frameId: -1,
    items: [],
    prevById: new Map(),
  })
  const animalCache = useRef<AnimalInterpCache>({
    source: null,
    prevSource: null,
    frameId: -1,
    items: [],
    prevById: new Map(),
  })
  const latest = useRef({ world, selectedOrgId, overlay, focus, viewFlags })
  latest.current = { world, selectedOrgId, overlay, focus, viewFlags }

  useEffect(() => {
    const canvas = canvasRef.current
    let context: CanvasRenderingContext2D | null = null
    try {
      context = canvas?.getContext('2d', { alpha: false }) ?? null
    } catch (error) {
      logger.error('2d-world', 'Canvas setup failed', error)
    }
    if (!canvas || !context) {
      onDrawError('The browser could not create a 2D canvas. Try reloading this page.')
      return
    }
    const ctx = context
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.max(1, Math.round(viewportDims.w * dpr))
    canvas.height = Math.max(1, Math.round(viewportDims.h * dpr))
    let raf = 0
    let stopped = false
    let lastFrameAt = -Infinity
    let lastWorld: WorldState | null = null
    let lastServerAt = -1
    let lastT = -1
    let lastUI = ''

    const tick = (now: number) => {
      if (stopped) return
      if (!rendererPaused) raf = requestAnimationFrame(tick)
      if (document.hidden || !shouldRenderFrame(now, lastFrameAt, LOW_PERF ? 20 : 30)) return
      lastFrameAt = now

      const { world: snapshot, selectedOrgId, overlay, focus, viewFlags } = latest.current
      const w = interp?.current.current ?? snapshot
      if (!w) return
      if (w.grid.depth_map) cachedDepth.current = w.grid.depth_map as number[][]
      if (w.grid.biomes) cachedBiomes.current = w.grid.biomes as number[][]

      const prev = interp?.prev.current
      const serverAt = interp?.currentServerAt.current ?? 0
      const interval = Math.max(50, serverAt - (interp?.prevServerAt.current ?? 0))
      const receivedAt = interp?.currentReceivedAt.current ?? 0
      const t = prev && interp?.current.current ? interpolationFactor(now, receivedAt, interval) : 1
      const cam = cameraStateRef.current
      const zoom = cam.zoom
      const uiKey = `${selectedOrgId ?? ''}|${overlay ?? ''}|${focus}|${JSON.stringify(viewFlags)}|${zoomDetailLevel(zoom)}|${cam.x}|${cam.y}|${zoom}`
      if (
        w === lastWorld &&
        serverAt === lastServerAt &&
        t === lastT &&
        uiKey === lastUI &&
        now - receivedAt > interval + 160 &&
        !prayerEffectsActive() &&
        !worldMomentsActive()
      )
        return

      let renderOrgs = w.viewport_organisms?.length ? w.viewport_organisms : w.organisms
      if (prev && interp?.current.current === w) {
        const previous = prev.viewport_organisms?.length ? prev.viewport_organisms : prev.organisms
        const cache = orgCache.current
        if (cache.prevSource !== previous) {
          cache.prevSource = previous
          cache.prevById.clear()
          for (const org of previous) cache.prevById.set(org.id, org)
        }
        if (cache.source !== renderOrgs || cache.frameId !== w.frame_id) {
          cache.source = renderOrgs
          cache.frameId = w.frame_id
          cache.items = renderOrgs.map((org) => ({ ...org }))
        }
        for (let i = 0; i < renderOrgs.length; i++) {
          const org = renderOrgs[i]
          const out = cache.items[i]
          const before = cache.prevById.get(org.id)
          out.x = before?.alive && org.alive ? before.x + (org.x - before.x) * t : org.x
          out.y = before?.alive && org.alive ? before.y + (org.y - before.y) * t : org.y
        }
        renderOrgs = cache.items
      }

      let renderAnimals = w.viewport_animals?.length ? w.viewport_animals : w.animals
      if (prev && interp?.current.current === w) {
        const previous = prev.viewport_animals?.length ? prev.viewport_animals : prev.animals
        const cache = animalCache.current
        if (cache.prevSource !== previous) {
          cache.prevSource = previous
          cache.prevById.clear()
          for (const animal of previous) cache.prevById.set(animal.id, animal)
        }
        if (cache.source !== renderAnimals || cache.frameId !== w.frame_id) {
          cache.source = renderAnimals
          cache.frameId = w.frame_id
          cache.items = renderAnimals.map((animal) => ({ ...animal }))
        }
        for (let i = 0; i < renderAnimals.length; i++) {
          const animal = renderAnimals[i]
          const out = cache.items[i]
          const before = cache.prevById.get(animal.id)
          out.x = before ? before.x + (animal.x - before.x) * t : animal.x
          out.y = before ? before.y + (animal.y - before.y) * t : animal.y
        }
        renderAnimals = cache.items
      }

      const lerpCycle = (before: number, after: number) => {
        let delta = after - before
        if (delta > 0.5) delta -= 1
        if (delta < -0.5) delta += 1
        return (((before + delta * t) % 1) + 1) % 1
      }

      const enriched: WorldState = {
        ...w,
        grid: {
          ...w.grid,
          depth_map: cachedDepth.current ?? w.grid.depth_map,
          biomes: cachedBiomes.current ?? w.grid.biomes,
        },
        viewport_organisms: renderOrgs,
        viewport_animals: renderAnimals,
        day_progress: prev ? lerpCycle(prev.day_progress, w.day_progress) : w.day_progress,
        season_progress: prev ? lerpCycle(prev.season_progress, w.season_progress) : w.season_progress,
      }
      const halfW = viewportDims.w / (2 * zoom)
      const halfH = viewportDims.h / (2 * zoom)
      const bounds = {
        c0: Math.max(0, Math.floor((cam.x - halfW) / TILE) - 4),
        c1: Math.min(w.grid.width, Math.ceil((cam.x + halfW) / TILE) + 4),
        r0: Math.max(0, Math.floor((cam.y - halfH) / TILE) - 4),
        r1: Math.min(w.grid.height, Math.ceil((cam.y + halfH) / TILE) + 4),
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.fillStyle = '#1a4a80'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.setTransform(
        dpr * zoom,
        0,
        0,
        dpr * zoom,
        dpr * (viewportDims.w / 2 - cam.x * zoom),
        dpr * (viewportDims.h / 2 - cam.y * zoom),
      )
      try {
        drawWorldOnCanvas(
          ctx,
          enriched,
          selectedOrgId,
          overlay,
          focus,
          viewFlags,
          bounds,
          zoom,
          worldRenderScale(zoom, dpr, LOW_PERF),
        )
      } catch (error) {
        stopped = true
        cancelAnimationFrame(raf)
        logger.error('2d-world', 'Canvas drawing failed', error)
        onDrawError('The world could not be drawn. Retry the renderer to restore the map.')
        return
      }
      lastWorld = w
      lastServerAt = serverAt
      lastT = t
      lastUI = uiKey
      if (!hasDrawn.current) {
        hasDrawn.current = true
        onFirstDraw()
      }
    }

    raf = requestAnimationFrame(tick)
    return () => {
      stopped = true
      cancelAnimationFrame(raf)
    }
  }, [cameraStateRef, interp, onDrawError, onFirstDraw, rendererPaused, viewportDims])

  return (
    <canvas
      ref={canvasRef}
      aria-label="World terrain and inhabitants"
      style={{ display: 'block', width: '100%', height: '100%' }}
    />
  )
}

interface Props {
  world: WorldState
  interp?: InterpRefs
  rendererPaused?: boolean
  sandboxArmed?: boolean
  sandboxLabel?: string | null
  /** Armed tool id, used to pick the effect that plays where it lands. */
  sandboxToolId?: string | null
  sandboxRadius?: number
  onSandboxApply?: (worldX: number, worldY: number) => void
  /** A prayer bubble on the map was clicked. */
  onPrayerClick?: (prayer: PrayerInfo) => void
}

export function WorldView({
  world,
  interp,
  rendererPaused = false,
  sandboxArmed,
  sandboxLabel,
  sandboxToolId,
  sandboxRadius,
  onSandboxApply,
  onPrayerClick,
}: Props) {
  const { bursts, spawn: spawnBurst } = useSandboxBursts()
  const selectedOrgId = useUIStore((s) => s.selectedOrgId)
  const followOrgId = useUIStore((s) => s.followOrgId)
  const overlay = useUIStore((s) => s.overlay)
  const focus = useUIStore((s) => s.focus)
  const setFocus = useUIStore((s) => s.setFocus)
  const viewFlags = useUIStore((s) => s.viewFlags)
  const onOrgSelect = useUIStore((s) => s.selectOrg)
  const territoryIndex = useMemo(() => buildTerritoryIndex(world.territory), [world.territory])
  const W = world.grid.width * TILE
  const H = world.grid.height * TILE
  const cx = W / 2
  const cy = H / 2

  const ox = world.grid.origin_x ?? 0
  const oy = world.grid.origin_y ?? 0

  const containerRef = useRef<HTMLDivElement>(null)
  const commandRef = useRef<MapCommand | null>(null)
  const cameraStateRef = useRef({ x: cx, y: cy, zoom: 1.5 })
  // Other panels (the prayer list) ask the camera to look at a tile.
  const focusRequest = useCameraFocus((s) => s.request)
  useEffect(() => {
    if (!focusRequest) return
    commandRef.current = {
      kind: 'focus',
      x: (focusRequest.x - ox + 0.5) * TILE,
      y: (focusRequest.y - oy + 0.5) * TILE,
    }
  }, [focusRequest, ox, oy])
  const [dims, setDims] = useState({ w: 0, h: 0 })
  const [mapReady, setMapReady] = useState(false)
  const [overPrayer, setOverPrayer] = useState(false)
  const [renderBackend, setRenderBackend] = useState<'gpu' | 'canvas'>(() =>
    canUseWorldGPU() ? 'gpu' : 'canvas',
  )
  const [drawError, setDrawError] = useState<string | null>(null)
  const [rendererKey, setRendererKey] = useState(0)
  // Stable identity: WorldSprite's frame-loop effect depends on this
  // callback - an inline arrow restarted that loop on every publish.
  const handleFirstDraw = useCallback(() => setMapReady(true), [])
  const gameControlsRef = useRef<GameControls | null>(null)
  const handleGPUFailure = useCallback(() => {
    gameControlsRef.current = null
    setMapReady(false)
    setRenderBackend('canvas')
  }, [])
  const rendererPausedRef = useRef(rendererPaused)
  rendererPausedRef.current = rendererPaused

  const handleGameReady = useCallback((controls: GameControls) => {
    gameControlsRef.current = controls
    syncRendererLoopPause(controls, rendererPausedRef.current)
  }, [])

  useEffect(() => {
    const controls = gameControlsRef.current
    if (controls) syncRendererLoopPause(controls, rendererPaused)
  }, [rendererPaused])

  useEffect(() => {
    if (renderBackend !== 'gpu' || mapReady || dims.w === 0 || dims.h === 0) return
    // Cubeforge reports some WebGL setup failures inside Game instead of
    // throwing. Its error UI sits behind the startup cover, so recover if a
    // first frame never arrives.
    const timeout = window.setTimeout(handleGPUFailure, 10_000)
    return () => window.clearTimeout(timeout)
  }, [renderBackend, mapReady, dims.w, dims.h, handleGPUFailure])

  useEffect(() => {
    const container = containerRef.current
    if (renderBackend !== 'gpu' || !container) return
    const lost = () => handleGPUFailure()
    container.addEventListener('webglcontextlost', lost, true)
    return () => container.removeEventListener('webglcontextlost', lost, true)
  }, [renderBackend, handleGPUFailure])

  const followTarget = followOrgId
    ? (() => {
        const org = world.organisms.find((o) => o.id === followOrgId && o.alive)
        return org ? { x: (org.x - ox) * TILE, y: (org.y - oy) * TILE } : null
      })()
    : null

  // Track pointer-down position so we can distinguish a tap (select)
  // from a drag-then-release (pan). Without this every pan ends with
  // an accidental org-select on the tile under the release point -
  // especially painful on touch where finger jitter is large.
  const pointerDownPos = useRef<{ x: number; y: number; moved: boolean; id: number } | null>(null)
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isMapControl(e.target)) return
    if (!e.isPrimary) {
      if (pointerDownPos.current) pointerDownPos.current.moved = true
      return
    }
    pointerDownPos.current = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId }
  }
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isMapControl(e.target)) return
    const down = pointerDownPos.current
    pointerDownPos.current = null
    if (down) {
      const dx = e.clientX - down.x
      const dy = e.clientY - down.y
      if (down.moved || dx * dx + dy * dy > 36) return
    }
    const rect = containerRef.current!.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const { x: camX, y: camY, zoom } = cameraStateRef.current
    const canvasTileX = (camX + (sx - dims.w / 2) / zoom) / TILE
    const canvasTileY = (camY + (sy - dims.h / 2) / zoom) / TILE
    const worldX = canvasTileX + ox
    const worldY = canvasTileY + oy

    if (
      canvasTileX < 0 ||
      canvasTileY < 0 ||
      canvasTileX >= world.grid.width ||
      canvasTileY >= world.grid.height
    )
      return

    if (sandboxArmed && onSandboxApply) {
      if (
        Math.round(worldX) < ox ||
        Math.round(worldX) >= ox + world.grid.width ||
        Math.round(worldY) < oy ||
        Math.round(worldY) >= oy + world.grid.height
      )
        return
      const burst = burstForTool(sandboxToolId)
      if (burst) spawnBurst(burst, sx, sy, (sandboxRadius ?? 0) * TILE * zoom)
      onSandboxApply(worldX, worldY)
      return
    }

    // A prayer bubble is a button: clicking it goes to help that tribe.
    if (onPrayerClick && world.prayers?.length && !viewFlags.hideUI) {
      const prayer = prayerAtPoint(
        world.prayers,
        canvasTileX * TILE,
        canvasTileY * TILE,
        { x: ox, y: oy },
        TILE,
        zoom,
      )
      if (prayer) {
        onPrayerClick(prayer)
        return
      }
    }

    const tx = Math.floor(worldX)
    const ty = Math.floor(worldY)

    if (viewFlags.territory) {
      const focusedLineage = focus.startsWith('lineage:') ? focus.slice('lineage:'.length) : null
      const lineageId = lineageAtTerritoryTile(territoryIndex, tx, ty, focusedLineage)
      onOrgSelect(null)
      useUIStore.setState({ panelOpen: false })
      setFocus(lineageId ? `lineage:${lineageId}` : 'all')
      return
    }

    const isCoarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

    let nearestOrg: { id: string; dist: number } | null = null
    let nearestOrgDist = Math.min(5, Math.max(1.2, (isCoarse ? 26 : 16) / (TILE * zoom)))
    for (const org of world.viewport_organisms?.length ? world.viewport_organisms : world.organisms) {
      if (!org.alive) continue
      const d = Math.hypot(org.x - worldX, org.y - worldY)
      if (d < nearestOrgDist) {
        nearestOrgDist = d
        nearestOrg = { id: org.id, dist: d }
      }
    }
    if (nearestOrg && nearestOrg.dist < 1.2) {
      onOrgSelect(nearestOrg.id)
      return
    }

    const ruinedBuildingAtTile = hasRuinedBuildingAtWorldTile(world.buildings, tx, ty)
    const localCol = tx - ox
    const localRow = ty - oy
    const tileRow = world.grid?.tiles?.[localRow]
    const tileVal = tileRow ? tileRow[localCol] : undefined
    if (isWaterTile(tileVal) && (!nearestOrg || nearestOrg.dist >= 2.5)) {
      onOrgSelect(null)
      return
    }
    const isHut = tileVal === TILE_ID.HUT
    const structRow = world.grid?.structure?.[localRow]
    const structVal = (structRow && structRow[localCol]) || 0
    if (!ruinedBuildingAtTile && (isHut || structVal >= 0.35)) {
      let bestHost: { id: string; age: number } | null = null
      for (const org of world.organisms) {
        if (!org.alive) continue
        const hx = Math.floor(org.home_x)
        const hy = Math.floor(org.home_y)
        if (hx === tx && hy === ty) {
          if (!bestHost || org.age > bestHost.age) {
            bestHost = { id: org.id, age: org.age }
          }
        }
      }
      if (bestHost) {
        useSceneStore.getState().enter({ kind: 'home', orgId: bestHost.id })
        return
      }
    }

    onOrgSelect(nearestOrg ? nearestOrg.id : null)
  }

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => {
      const { clientWidth, clientHeight } = el
      if (clientWidth > 0 && clientHeight > 0) {
        setDims({ w: clientWidth, h: clientHeight })
      }
    }
    measure()
    const obs = new ResizeObserver(measure)
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return (
    <div
      ref={containerRef}
      className="map2d-world"
      tabIndex={0}
      aria-label="Interactive world map"
      style={{
        flex: 1,
        minWidth: 0,
        overflow: 'hidden',
        cursor: sandboxArmed ? 'crosshair' : overPrayer ? 'pointer' : 'grab',
        position: 'relative',
        // touch-action: none stops the browser from claiming
        // two-finger pinch as page-zoom; the gesture handler
        // gets the events instead.
        touchAction: 'none',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={(e) => {
        const down = pointerDownPos.current
        if (down && ((e.clientX - down.x) ** 2 + (e.clientY - down.y) ** 2 > 36 || e.pointerId !== down.id))
          down.moved = true
        // Show a hand over prayer bubbles so they read as buttons.
        let hovering = false
        if (!sandboxArmed && !down && world.prayers?.length && containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect()
          const { x: camX, y: camY, zoom } = cameraStateRef.current
          const mx = camX + (e.clientX - rect.left - dims.w / 2) / zoom
          const my = camY + (e.clientY - rect.top - dims.h / 2) / zoom
          hovering = !!prayerAtPoint(world.prayers, mx, my, { x: ox, y: oy }, TILE, zoom)
        }
        if (hovering !== overPrayer) setOverPrayer(hovering)
      }}
      onPointerCancel={() => {
        if (pointerDownPos.current) pointerDownPos.current.moved = true
      }}
      onClick={handleClick}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: '#1a4a80',
          zIndex: 10,
          pointerEvents: 'none',
          opacity: mapReady ? 0 : 1,
          transition: 'opacity 280ms ease-out',
        }}
      />
      {dims.w > 0 &&
        dims.h > 0 &&
        (renderBackend === 'gpu' ? (
          <World2DErrorBoundary key={rendererKey} onCrash={handleGPUFailure}>
            <Game
              mode="onDemand"
              gravity={0}
              width={dims.w}
              height={dims.h}
              onReady={handleGameReady}
              style={{ display: 'block' }}
            >
              <World background="#1a4a80">
                <Camera2D />

                <Entity>
                  <WorldSprite
                    world={world}
                    interp={interp}
                    selectedOrgId={selectedOrgId}
                    overlay={overlay}
                    focus={focus}
                    viewFlags={viewFlags}
                    rendererPaused={rendererPaused}
                    onFirstDraw={handleFirstDraw}
                    onDrawError={setDrawError}
                    atX={cx}
                    atY={cy}
                    cameraStateRef={cameraStateRef}
                    viewportDims={dims}
                  />
                </Entity>

                <MapCameraController
                  commandRef={commandRef}
                  worldW={W}
                  worldH={H}
                  containerW={dims.w}
                  containerH={dims.h}
                  containerEl={containerRef.current}
                  cameraStateRef={cameraStateRef}
                  followTarget={followTarget}
                />
              </World>
            </Game>
          </World2DErrorBoundary>
        ) : (
          <>
            <CanvasWorldFallback
              key={rendererKey}
              world={world}
              interp={interp}
              selectedOrgId={selectedOrgId}
              overlay={overlay}
              focus={focus}
              viewFlags={viewFlags}
              rendererPaused={rendererPaused}
              onFirstDraw={handleFirstDraw}
              onDrawError={setDrawError}
              cameraStateRef={cameraStateRef}
              viewportDims={dims}
            />
            <CanvasCameraController
              commandRef={commandRef}
              worldW={W}
              worldH={H}
              containerW={dims.w}
              containerH={dims.h}
              containerEl={containerRef.current}
              cameraStateRef={cameraStateRef}
              followTarget={followTarget}
            />
          </>
        ))}
      {drawError && (
        <div
          role="alert"
          data-map-ui
          style={{
            position: 'absolute',
            inset: '35% 15%',
            padding: 24,
            background: '#241f19',
            color: '#fff',
            zIndex: 20,
          }}
        >
          <p>{drawError}</p>
          <button
            onClick={() => {
              setDrawError(null)
              setMapReady(false)
              setRendererKey((key) => key + 1)
            }}
          >
            Retry renderer
          </button>
        </div>
      )}
      <SandboxBursts bursts={bursts} width={dims.w} height={dims.h} />
      {mapReady && !viewFlags.hideUI && (
        <WorldMapHud
          world={world}
          cameraRef={cameraStateRef}
          viewport={dims}
          container={containerRef.current}
          toolLabel={sandboxArmed ? sandboxLabel : null}
          toolRadius={sandboxRadius}
        />
      )}
    </div>
  )
}
