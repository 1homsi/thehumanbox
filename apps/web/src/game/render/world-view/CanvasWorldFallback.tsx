import { drawWorldOnCanvas } from '../draw-world'
import type { AnimalInterpCache, OrgInterpCache } from '../draw-helpers'
import { worldRenderScale, interpolationFactor, shouldRenderFrame } from '../render-timing'
import { useEffect, useRef } from 'react'
import type { WorldState } from '../../../shared/types'
import type { InterpRefs } from '../../../simulation/useSimulation'
import type { ViewFlags } from '../../../state/store'
import { worldMomentsActive } from '../world-moments'
import { prayerEffectsActive } from '../prayer-feedback'
import { LOW_PERF } from '../../../shared/perf'
import { logger } from '../../../shared/logger'
import { zoomDetailLevel } from '../character-visuals'
import { TILE } from '../../model/palette'

export function CanvasWorldFallback({
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
