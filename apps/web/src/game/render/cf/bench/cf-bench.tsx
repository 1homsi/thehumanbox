/* eslint-disable react-refresh/only-export-components -- a benchmark page, not an app module */
import { createRoot } from 'react-dom/client'
import { useEffect, useMemo, useRef } from 'react'
import {
  Camera2D,
  Entity,
  Game,
  Sprite,
  Transform,
  World,
  useCamera,
  useDynamicCanvas,
  useEntity,
  useGame,
} from 'cubeforge'
import type { CameraControls, EngineState, SpriteComponent, TransformComponent } from 'cubeforge'
import init, { Sim } from '../../../../wasm/sim-core/sim_core'
import { parseWorldFrame } from '../../../../simulation/wire'
import { mergeFrame } from '../../../../simulation/merge'
import { useUIStore } from '../../../../state/store'
import type { ViewFlags } from '../../../../state/store'
import type { WorldState } from '../../../../shared/types'
import { TILE } from '../../../model/palette'
import { createFrame } from '../../layers/frame'
import { draw_atmosphere } from '../../layers/atmosphere'
import { draw_overlays } from '../../layers/overlays'
import { draw_effects } from '../../layers/effects'
import { draw_hud } from '../../layers/hud'
import { drawTradeNetwork2D } from '../../base-parts/trade-network'
import { SpriteLayer } from 'cubeforge'
import { CfOverlays } from '../overlays/CfOverlays'
import { engineRenderHost } from '../overlays/host'
import { GlyphSet } from '../overlays/glyph-atlas'
import { ShapeAtlas } from '../overlays/shape-atlas'
import { SpriteRecorder } from '../overlays/recorder'
import { Experiment, type ExperimentSpec } from './experiments'
import { collectSettlementLabels, placeLabels } from '../overlays/settlement-label-list'
import { NO_FEATURES, type CfFeatures } from '../overlays/features'
import { makeFrame, type CfFrame } from '../overlays/frame'
import type { CfOverlayRenderer } from '../overlays/renderer'
import { applyScenario, ensureGrids, ensureTerritory, rng, townCentre, type Scenario } from './world'
import { diffImage, diffStats } from './diff'

const GROUND = [79, 127, 63] as const
const GROUND_CSS = `rgb(${GROUND.join(',')})`

declare global {
  interface Window {
    __cf: typeof api
  }
}

const out = document.querySelector<HTMLPreElement>('#out')!
const refCanvas = document.querySelector<HTMLCanvasElement>('#ref')!
const diffCanvas = document.querySelector<HTMLCanvasElement>('#diff')!
const composite = document.querySelector<HTMLCanvasElement>('#composite')!
/** Wait n animation frames; refuses to wait forever on a hidden tab (rAF does not run there). */
const frames = (n: number) =>
  new Promise<void>((resolve, reject) => {
    const guard = window.setTimeout(
      () => reject(new Error(`rAF stalled (document.hidden=${document.hidden})`)),
      4000,
    )
    const step = (left: number) => {
      if (left <= 0) {
        window.clearTimeout(guard)
        resolve()
      } else requestAnimationFrame(() => step(left - 1))
    }
    step(n)
  })

interface StageState {
  engine: EngineState | null
  camera: CameraControls | null
  renderer: CfOverlayRenderer | null
  viewport: { w: number; h: number }
  mode: 'cf' | 'canvas' | 'none'
  paintCanvas: ((ctx: CanvasRenderingContext2D, w: number, h: number) => void) | null
  canvasHandle: { markDirty: () => void; ctx: CanvasRenderingContext2D } | null
  canvasEntity: number | null
}
const stage: StageState = {
  engine: null,
  camera: null,
  renderer: null,
  viewport: { w: 960, h: 540 },
  mode: 'cf',
  paintCanvas: null,
  canvasHandle: null,
  canvasEntity: null,
}

let baseWorld: WorldState | null = null
let current: { world: WorldState; sc: Scenario; centre: { x: number; y: number } } | null = null

// ── the cubeforge side ────────────────────────────────────────────────────────

function Probe({ onReady }: { onReady: () => void }) {
  const engine = useGame()
  const camera = useCamera()
  useEffect(() => {
    stage.engine = engine
    stage.camera = camera
    onReady()
  }, [engine, camera, onReady])
  return null
}

/** The canvas-painted world as one screen-sized sprite: what the app does today, for the cost comparison. */
function CanvasSpriteInner({ w, h }: { w: number; h: number }) {
  const dpr = window.devicePixelRatio || 1
  const dyn = useDynamicCanvas(Math.round(w * dpr), Math.round(h * dpr))
  const id = useEntity()
  useEffect(() => {
    stage.canvasHandle = { markDirty: () => dyn.markDirty(), ctx: dyn.ctx }
    stage.canvasEntity = id
    return () => {
      stage.canvasHandle = null
    }
  }, [dyn, id])
  return (
    <>
      <Transform x={0} y={0} />
      <Sprite width={1} height={1} dynamicSrc={dyn.id} color="#ffffff" zIndex={0} />
    </>
  )
}

function CanvasSprite({ w, h }: { w: number; h: number }) {
  return (
    <Entity>
      <CanvasSpriteInner w={w} h={h} />
    </Entity>
  )
}

function Stage({
  world,
  mode,
  size,
  onRenderer,
  exp,
}: {
  world: WorldState
  mode: 'cf' | 'canvas' | 'none'
  size: { w: number; h: number }
  onRenderer: (r: CfOverlayRenderer | null) => void
  exp?: ExperimentSpec
}) {
  const cameraRef = useRef({ x: 0, y: 0, zoom: 1 })
  const noop = useMemo(() => () => {}, [])
  const all: CfFeatures = useMemo(
    () => ({
      ...NO_FEATURES,
      atmosphere: true,
      overlays: true,
      effects: true,
      hud: true,
      water: true,
      glow: true,
      roads: true,
    }),
    [],
  )
  const flags = useUIStore.getState().viewFlags
  return (
    <Game width={size.w} height={size.h} mode="onDemand" gravity={0} style={{ display: 'block' }}>
      <World background={GROUND_CSS}>
        <Camera2D />
        <Probe onReady={noop} />
        {mode === 'cf' && (
          <CfOverlays
            world={world}
            overlay={null}
            focus="all"
            viewFlags={flags}
            features={all}
            rendererPaused
            cameraStateRef={cameraRef}
            viewportDims={size}
            onRenderer={onRenderer}
          />
        )}
        {mode === 'canvas' && <CanvasSprite w={size.w} h={size.h} />}
        {exp && <Experiment spec={exp} />}
      </World>
    </Game>
  )
}

let root: ReturnType<typeof createRoot> | null = null
async function mountStage(world: WorldState, mode: StageState['mode'], exp?: ExperimentSpec) {
  const host = document.querySelector<HTMLDivElement>('#stage')!
  if (root) {
    root.unmount()
    root = null
    stage.renderer = null
    stage.engine = null
  }
  host.replaceChildren()
  const el = document.createElement('div')
  host.appendChild(el)
  root = createRoot(el)
  stage.mode = mode
  root.render(
    <Stage
      world={world}
      mode={mode}
      size={stage.viewport}
      onRenderer={(r) => {
        stage.renderer = r
      }}
      exp={exp}
    />,
  )
  for (let i = 0; i < 60 && !(stage.engine && (mode !== 'cf' || stage.renderer)); i++) await frames(1)
  await frames(2)
}

async function setCamera(cx: number, cy: number, zoom: number) {
  const cam = stage.camera!
  cam.setZoom(zoom)
  cam.setPosition(cx, cy)
  for (let i = 0; i < 30; i++) {
    await frames(1)
    const p = cam.getPosition()
    if (Math.abs(p.x - cx) < 0.5 && Math.abs(p.y - cy) < 0.5) break
  }
}

function readGl(canvas: HTMLCanvasElement): Uint8Array {
  const gl = canvas.getContext('webgl2') as WebGL2RenderingContext
  const w = gl.drawingBufferWidth
  const h = gl.drawingBufferHeight
  const buf = new Uint8Array(w * h * 4)
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf)
  const flipped = new Uint8Array(buf.length)
  for (let y = 0; y < h; y++) flipped.set(buf.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4)
  return flipped
}

/** Wait for the engine to draw, then read its framebuffer in the same task as that draw. */
function captureEngine(): Promise<Uint8Array> {
  const canvas = stage.engine!.canvas
  return new Promise((resolve) => {
    stage.engine!.loop.markDirty()
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        stage.engine!.loop.markDirty()
        requestAnimationFrame(() => resolve(readGl(canvas)))
      })
    })
  })
}

// ── the canvas side ───────────────────────────────────────────────────────────

function dprNow() {
  return window.devicePixelRatio || 1
}

function frameFor(sc: Scenario, world: WorldState, centre: { x: number; y: number }, t: number): CfFrame {
  const flags: ViewFlags = { ...useUIStore.getState().viewFlags, ...sc.flags } as ViewFlags
  return makeFrame({
    world,
    t,
    zoom: sc.zoom,
    cam: { x: centre.x * TILE, y: centre.y * TILE },
    viewport: sc.viewport ?? stage.viewport,
    dpr: dprNow(),
    overlay: sc.overlay ?? null,
    focus: 'all',
    viewFlags: flags,
  })
}

/** Run the canvas painters for `features` onto `ctx` exactly as the app does (screen pixels, camera transform). */
function paintCanvasLayers(ctx: CanvasRenderingContext2D, f: CfFrame, features: CfFeatures) {
  const dpr = f.dpr
  const w = Math.round(f.viewport.w * dpr)
  const h = Math.round(f.viewport.h * dpr)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = GROUND_CSS
  ctx.fillRect(0, 0, w, h)
  const s = f.zoom * dpr
  ctx.setTransform(s, 0, 0, s, w / 2 - f.cam.x * s, h / 2 - f.cam.y * s)
  const realNow = Date.now
  Date.now = () => f.t
  try {
    const frame = createFrame(ctx, f.world, null, f.overlay, f.focus, f.viewFlags, f.bounds, f.zoom, 1)
    if (!frame) throw new Error('no base layer')
    if (features.atmosphere) draw_atmosphere(frame)
    if (features.overlays) draw_overlays(frame)
    if (features.roads) drawTradeNetwork2D(ctx, f.world, f.bounds, f.t, 'roads')
    if (features.effects) draw_effects(frame)
    if (features.hud) {
      if (!f.viewFlags.hideUI) {
        const measure = (text: string, kind: 'major' | 'minor' | 'sub') => {
          ctx.font =
            kind === 'sub' ? '8px monospace' : kind === 'major' ? 'bold 12px monospace' : '10px monospace'
          return ctx.measureText(text).width
        }
        frame.placedSettlementLabels = placeLabels(
          collectSettlementLabels(f.world, f.bounds, f.zoom),
          f.zoom,
          measure,
          f.W,
          f.H,
        )
      }
      draw_hud(frame)
    }
  } finally {
    Date.now = realNow
  }
}

function summarise(times: number[]) {
  const s = [...times].sort((a, b) => a - b)
  const mean = s.reduce((a, b) => a + b, 0) / Math.max(1, s.length)
  return {
    mean: +mean.toFixed(3),
    p50: +s[Math.floor(s.length / 2)]?.toFixed(3),
    p95: +s[Math.min(s.length - 1, Math.floor(s.length * 0.95))]?.toFixed(3),
    n: s.length,
  }
}

interface GpuTimer {
  TIME_ELAPSED_EXT: number
  GPU_DISJOINT_EXT: number
}

/**
 * Run `count` frames, calling `before(i)` ahead of each, and collect GPU time from timer queries
 * wrapped round the render system's update (needs Chrome's --enable-webgl-draft-extensions) and the CPU
 * time that update itself took.
 */
async function profileFrames(engine: EngineState, count: number, before: (i: number) => void) {
  const gl = engine.canvas.getContext('webgl2') as WebGL2RenderingContext
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as GpuTimer | null
  if (!ext) throw new Error('no timer query extension')
  const rs = engine.activeRenderSystem as unknown as { update: (...a: unknown[]) => unknown }
  const orig = rs.update
  const pending: WebGLQuery[] = []
  const gpu: number[] = []
  const renderCpu: number[] = []
  rs.update = function (this: unknown, ...args: unknown[]) {
    const q = gl.createQuery()!
    gl.beginQuery(ext.TIME_ELAPSED_EXT, q)
    const a = performance.now()
    const r = orig.apply(this, args)
    renderCpu.push(performance.now() - a)
    gl.endQuery(ext.TIME_ELAPSED_EXT)
    pending.push(q)
    return r
  }
  const drain = () => {
    while (pending.length) {
      const q = pending[0]
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break
      if (!gl.getParameter(ext.GPU_DISJOINT_EXT))
        gpu.push(Number(gl.getQueryParameter(q, gl.QUERY_RESULT)) / 1e6)
      gl.deleteQuery(q)
      pending.shift()
    }
  }
  try {
    for (let i = 0; i < count + 20; i++) {
      before(i)
      await frames(1)
      drain()
    }
    for (let i = 0; i < 10; i++) {
      await frames(1)
      drain()
    }
  } finally {
    rs.update = orig
  }
  const stats = engine.stats ?? engine.getStats?.()
  return {
    gpuMs: summarise(gpu.slice(10)),
    renderCpuMs: summarise(renderCpu.slice(10)),
    drawCalls: stats?.render.drawCalls,
    instances: stats?.render.instances,
    uploadBytes: stats?.render.textureUploadBytes,
    textCacheHits: stats?.render.textCacheHits,
    textCacheMisses: stats?.render.textCacheMisses,
    textures: stats?.render.textureCount,
    entities: stats?.entityCount,
  }
}

// ── public API for the browser tools ──────────────────────────────────────────

const api = {
  async init(ticks = 2500, seed = 42) {
    await init()
    const sim = new Sim(BigInt(seed))
    sim.tickN(ticks)
    const parsed = parseWorldFrame(sim.fullFrame(1, Date.now()))
    sim.free()
    if (parsed.isErr()) throw new Error(String(parsed.error))
    const { next } = mergeFrame(parsed.value, {
      organisms: new Map(),
      animals: new Map(),
      grid: null,
      prevWorld: null,
    })
    ensureGrids(next)
    ensureTerritory(next)
    baseWorld = next
    return api.info()
  },

  info() {
    const w = baseWorld!
    return {
      grid: [w.grid.width, w.grid.height],
      origin: [w.grid.origin_x, w.grid.origin_y],
      organisms: w.organisms.length,
      settlements: (w.settlements ?? []).map((s) => ({
        n: s.name,
        tier: s.tier,
        pop: s.population,
        c: s.center,
      })),
      buildings: w.buildings?.length ?? 0,
      tick: w.tick,
      centre: townCentre(w),
      dpr: dprNow(),
      territory: w.territory?.claimed.length ?? 0,
    }
  },

  /** Mount the stage for a scenario and point the camera at it. */
  async setup(sc: Scenario, mode: StageState['mode'] = 'cf') {
    if (!baseWorld) throw new Error('call init() first')
    if (sc.viewport) stage.viewport = sc.viewport
    const world = applyScenario(baseWorld, sc)
    const centre = sc.centre ?? townCentre(baseWorld)
    current = { world, sc, centre }
    await mountStage(world, mode)
    await setCamera(centre.x * TILE, centre.y * TILE, sc.zoom)
    return { viewport: stage.viewport, dpr: dprNow(), centre }
  },

  /** Paint the canvas reference and the cubeforge frame for the same instant and diff them. */
  async compare(features: Partial<CfFeatures>, t = 1_700_000_000_000) {
    if (!current || !stage.renderer) throw new Error('call setup() in cf mode first')
    const feat: CfFeatures = { ...NO_FEATURES, ...features }
    const f = frameFor(current.sc, current.world, current.centre, t)
    // Canvas reference.
    const dpr = f.dpr
    const w = Math.round(f.viewport.w * dpr)
    const h = Math.round(f.viewport.h * dpr)
    refCanvas.width = w
    refCanvas.height = h
    const ctx = refCanvas.getContext('2d', { willReadFrequently: true })!
    const c0 = performance.now()
    paintCanvasLayers(ctx, f, feat)
    const canvasMs = performance.now() - c0
    const ref = ctx.getImageData(0, 0, w, h).data
    // Cubeforge.
    const renderer = stage.renderer
    renderer.features = feat
    const res = renderer.update(f)
    const gl = await captureEngine()
    const diff = diffStats(ref, gl, GROUND)
    diffCanvas.width = w
    diffCanvas.height = h
    const dctx = diffCanvas.getContext('2d')!
    const img = dctx.createImageData(w, h)
    diffImage(ref, gl, img.data)
    dctx.putImageData(img, 0, 0)
    // Side by side for a human: canvas reference | cubeforge | difference.
    const glCanvas = document.createElement('canvas')
    glCanvas.width = w
    glCanvas.height = h
    const gimg = new ImageData(new Uint8ClampedArray(gl.buffer as ArrayBuffer), w, h)
    glCanvas.getContext('2d')!.putImageData(gimg, 0, 0)
    composite.width = w
    composite.height = h * 3
    const cctx = composite.getContext('2d')!
    cctx.drawImage(refCanvas, 0, 0)
    cctx.drawImage(glCanvas, 0, h)
    cctx.drawImage(diffCanvas, 0, h * 2)
    return {
      canvasMs: +canvasMs.toFixed(2),
      cfUpdateMs: +res.times.total.toFixed(2),
      sprites: res.sprites,
      unsupported: res.unsupported,
      diff: {
        meanAbs: +diff.meanAbs.toFixed(3),
        over8: +(diff.over8 * 100).toFixed(2),
        over24: +(diff.over24 * 100).toFixed(2),
        over64: +(diff.over64 * 100).toFixed(2),
        coveredPct: +((diff.covered / diff.pixels) * 100).toFixed(2),
        coveredMeanAbs: +diff.coveredMeanAbs.toFixed(2),
        coveredOver24: +(diff.coveredOver24 * 100).toFixed(2),
      },
    }
  },

  /** Per-frame CPU of the canvas painters vs the cubeforge update, and the engine's own frame stats. */
  async perf(features: Partial<CfFeatures>, count = 60, rebuild = false) {
    if (!current || !stage.renderer) throw new Error('call setup() in cf mode first')
    const feat: CfFeatures = { ...NO_FEATURES, ...features }
    const renderer = stage.renderer
    renderer.features = feat
    const dpr = dprNow()
    const w = Math.round(stage.viewport.w * dpr)
    const h = Math.round(stage.viewport.h * dpr)
    const cv = document.createElement('canvas')
    cv.width = w
    cv.height = h
    const ctx = cv.getContext('2d')!
    const t0 = 1_700_000_000_000
    const canvasTimes: number[] = []
    for (let i = 0; i < count + 5; i++) {
      const f = frameFor(current.sc, current.world, current.centre, t0 + i * 33)
      const a = performance.now()
      paintCanvasLayers(ctx, f, feat)
      if (i >= 5) canvasTimes.push(performance.now() - a)
    }
    const cfTimes: number[] = []
    const sections: Record<string, number[]> = {}
    let sprites = 0
    for (let i = 0; i < count + 5; i++) {
      const world = rebuild ? { ...current.world, frame_id: current.world.frame_id + i + 1 } : current.world
      const f = frameFor(current.sc, world, current.centre, t0 + i * 33)
      const r = renderer.update(f)
      if (i >= 5) {
        cfTimes.push(r.times.total)
        for (const [k, v] of Object.entries(r.times)) (sections[k] ??= []).push(v)
        sprites = r.sprites
      }
    }
    // Engine side: frame cost with the layers on screen.
    const engine = stage.engine!
    const stats = {
      render: [] as number[],
      update: [] as number[],
      draws: 0,
      instances: 0,
      uploadBytes: [] as number[],
    }
    for (let i = 0; i < 30; i++) {
      const f = frameFor(current.sc, current.world, current.centre, t0 + i * 33)
      renderer.update(f)
      await frames(1)
      const s = engine.stats ?? engine.getStats?.()
      if (s && i >= 5) {
        stats.render.push(s.renderMs)
        stats.update.push(s.updateMs)
        stats.draws = s.render.drawCalls
        stats.instances = s.render.instances
        stats.uploadBytes.push(s.render.textureUploadBytes)
      }
    }
    return {
      canvasPaintMs: summarise(canvasTimes),
      cfUpdateMs: summarise(cfTimes),
      sections: Object.fromEntries(Object.entries(sections).map(([k, v]) => [k, summarise(v).mean])),
      sprites,
      engine: {
        renderMs: summarise(stats.render),
        updateMs: summarise(stats.update),
        drawCalls: stats.draws,
        instances: stats.instances,
        uploadBytes: summarise(stats.uploadBytes).mean,
      },
    }
  },

  /** The same canvas painters shown the way the app shows them: painted into a dynamic canvas sprite each frame. */
  async perfCanvasSprite(features: Partial<CfFeatures>, count = 30) {
    if (!current || !baseWorld) throw new Error('call init() and setup() first')
    const feat: CfFeatures = { ...NO_FEATURES, ...features }
    await mountStage(current.world, 'canvas')
    await setCamera(current.centre.x * TILE, current.centre.y * TILE, current.sc.zoom)
    const engine = stage.engine!
    const h = stage.canvasHandle!
    const t0 = 1_700_000_000_000
    const paint: number[] = []
    const render: number[] = []
    const update: number[] = []
    const upload: number[] = []
    let draws = 0
    for (let i = 0; i < count + 5; i++) {
      const f = frameFor(current.sc, current.world, current.centre, t0 + i * 33)
      const a = performance.now()
      paintCanvasLayers(h.ctx, f, feat)
      h.markDirty()
      const b = performance.now()
      const id = stage.canvasEntity
      if (id !== null) {
        const sprite = engine.ecs.getComponent<SpriteComponent>(id, 'Sprite')
        const tr = engine.ecs.getComponent<TransformComponent>(id, 'Transform')
        if (sprite && tr) {
          sprite.width = stage.viewport.w / current.sc.zoom
          sprite.height = stage.viewport.h / current.sc.zoom
          tr.x = current.centre.x * TILE
          tr.y = current.centre.y * TILE
        }
      }
      await frames(1)
      const s = engine.stats ?? engine.getStats?.()
      if (s && i >= 5) {
        paint.push(b - a)
        render.push(s.renderMs)
        update.push(s.updateMs)
        upload.push(s.render.textureUploadBytes)
        draws = s.render.drawCalls
      }
    }
    return {
      paintMs: summarise(paint),
      renderMs: summarise(render),
      updateMs: summarise(update),
      uploadBytes: summarise(upload).mean,
      drawCalls: draws,
    }
  },

  /**
   * Whole-frame cost with vsync off: update the layers (or repaint the canvas sprite) and wait for
   * the next frame, `count` times, reporting the mean/p95 interval. Run Chrome with
   * --disable-gpu-vsync --disable-frame-rate-limit so the interval is the work, not the display.
   */
  async flatOut(
    kind: 'cf' | 'canvas' | 'empty',
    features: Partial<CfFeatures>,
    count = 240,
    rebuild = false,
  ) {
    if (!current || !baseWorld) throw new Error('call init() and setup() first')
    const feat: CfFeatures = { ...NO_FEATURES, ...features }
    await mountStage(current.world, kind === 'canvas' ? 'canvas' : kind === 'cf' ? 'cf' : 'none')
    await setCamera(current.centre.x * TILE, current.centre.y * TILE, current.sc.zoom)
    const engine = stage.engine!
    if (kind === 'cf') stage.renderer!.features = feat
    const t0 = 1_700_000_000_000
    const intervals: number[] = []
    const cpu: number[] = []
    let last = 0
    for (let i = 0; i < count + 20; i++) {
      const a = performance.now()
      const world = rebuild ? { ...current.world, frame_id: current.world.frame_id + i + 1 } : current.world
      const f = frameFor(current.sc, world, current.centre, t0 + i * 33)
      if (kind === 'cf') stage.renderer!.update(f)
      else if (kind === 'canvas') {
        paintCanvasLayers(stage.canvasHandle!.ctx, f, feat)
        stage.canvasHandle!.markDirty()
        const id = stage.canvasEntity
        if (id !== null) {
          const sprite = engine.ecs.getComponent<SpriteComponent>(id, 'Sprite')
          const tr = engine.ecs.getComponent<TransformComponent>(id, 'Transform')
          if (sprite && tr) {
            sprite.width = stage.viewport.w / current.sc.zoom
            sprite.height = stage.viewport.h / current.sc.zoom
            tr.x = current.centre.x * TILE
            tr.y = current.centre.y * TILE
          }
        }
      } else engine.loop.markDirty()
      const b = performance.now()
      await frames(1)
      const now = performance.now()
      if (i >= 20) {
        intervals.push(now - last)
        cpu.push(b - a)
      }
      last = now
    }
    const stats = engine.stats ?? engine.getStats?.()
    return {
      interval: summarise(intervals),
      cpu: summarise(cpu),
      drawCalls: stats?.render.drawCalls,
      instances: stats?.render.instances,
      textureUploadBytes: stats?.render.textureUploadBytes,
    }
  },

  /**
   * GPU time per frame from timer queries wrapped round the render system's update (needs Chrome's
   * --enable-webgl-draft-extensions), next to the engine's own CPU timings for the same frames.
   */
  async gpuProfile(
    kind: 'cf' | 'canvas' | 'empty',
    features: Partial<CfFeatures>,
    count = 120,
    rebuild = false,
  ) {
    if (!current || !baseWorld) throw new Error('call init() and setup() first')
    const feat: CfFeatures = { ...NO_FEATURES, ...features }
    await mountStage(current.world, kind === 'canvas' ? 'canvas' : kind === 'cf' ? 'cf' : 'none')
    await setCamera(current.centre.x * TILE, current.centre.y * TILE, current.sc.zoom)
    const engine = stage.engine!
    if (kind === 'cf') stage.renderer!.features = feat
    const t0 = 1_700_000_000_000
    return profileFrames(engine, count, (i) => {
      const world = rebuild
        ? { ...current!.world, frame_id: current!.world.frame_id + i + 1 }
        : current!.world
      const f = frameFor(current!.sc, world, current!.centre, t0 + i * 33)
      if (kind === 'cf') stage.renderer!.update(f)
      else if (kind === 'canvas') {
        paintCanvasLayers(stage.canvasHandle!.ctx, f, feat)
        stage.canvasHandle!.markDirty()
        const id = stage.canvasEntity
        if (id !== null) {
          const sprite = engine.ecs.getComponent<SpriteComponent>(id, 'Sprite')
          const tr = engine.ecs.getComponent<TransformComponent>(id, 'Transform')
          if (sprite && tr) {
            sprite.width = stage.viewport.w / current!.sc.zoom
            sprite.height = stage.viewport.h / current!.sc.zoom
            tr.x = current!.centre.x * TILE
            tr.y = current!.centre.y * TILE
          }
        }
      } else engine.loop.markDirty()
    })
  },

  /** One cubeforge feature on its own: does it draw in WebGL, and what does N of it cost? */
  async experiment(spec: Omit<ExperimentSpec, 'box'> & { box?: ExperimentSpec['box'] }, count = 60) {
    if (!current || !baseWorld) throw new Error('call init() and setup() first')
    const full: ExperimentSpec = {
      ...spec,
      box: spec.box ?? {
        cx: current.centre.x * TILE,
        cy: current.centre.y * TILE,
        w: stage.viewport.w / current.sc.zoom - 40,
        h: stage.viewport.h / current.sc.zoom - 40,
      },
    }
    const t0 = performance.now()
    await mountStage(current.world, 'none', full)
    const mountMs = performance.now() - t0
    await setCamera(current.centre.x * TILE, current.centre.y * TILE, current.sc.zoom)
    const engine = stage.engine!
    await frames(3)
    const pixels = await captureEngine()
    let changed = 0
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] !== GROUND[0] || pixels[i + 1] !== GROUND[1] || pixels[i + 2] !== GROUND[2]) changed++
    }
    const prof = await profileFrames(engine, count, () => engine.loop.markDirty())
    return {
      spec: { kind: spec.kind, n: spec.n },
      mountMs: +mountMs.toFixed(1),
      changedPixels: changed,
      pixelPct: +((changed / (pixels.length / 4)) * 100).toFixed(2),
      ...prof,
    }
  },

  /** The same N labels as the engine's `Text` entities, drawn through the glyph atlas instead. */
  async experimentGlyphText(n: number, fontSize = 10, count = 60) {
    if (!current || !baseWorld) throw new Error('call init() and setup() first')
    await mountStage(current.world, 'none')
    await setCamera(current.centre.x * TILE, current.centre.y * TILE, current.sc.zoom)
    const engine = stage.engine!
    const host = engineRenderHost(engine)
    const shapes = new ShapeAtlas(host)
    const glyphs = new GlyphSet(host)
    const shapeLayer = new SpriteLayer({ atlases: [shapes.layerAtlas()], zIndex: 5, sampling: 'linear' })
    const textLayer = new SpriteLayer({ atlases: glyphs.layerAtlases(), zIndex: 5.5, sampling: 'linear' })
    host.addLayer(shapeLayer)
    host.addLayer(textLayer)
    const rec = new SpriteRecorder(shapeLayer, textLayer, shapes, glyphs)
    const rand = rng(77)
    const box = {
      cx: current.centre.x * TILE,
      cy: current.centre.y * TILE,
      w: stage.viewport.w / current.sc.zoom - 40,
      h: stage.viewport.h / current.sc.zoom - 40,
    }
    const pts = Array.from({ length: n }, (_, i) => ({
      i,
      x: box.cx + (rand() - 0.5) * box.w,
      y: box.cy + (rand() - 0.5) * box.h,
    }))
    const zoom = current.sc.zoom
    const record = () => {
      rec.begin({ zoom, dpr: dprNow() })
      const ctx = rec.asContext()
      ctx.font = `${fontSize}px monospace`
      ctx.fillStyle = '#ffffff'
      for (const p of pts) ctx.fillText(`Settlement ${p.i}`, p.x, p.y)
      rec.end()
    }
    const recordMs: number[] = []
    const prof = await profileFrames(engine, count, () => {
      const a = performance.now()
      record()
      recordMs.push(performance.now() - a)
      engine.loop.markDirty()
    })
    host.removeLayer(shapeLayer)
    host.removeLayer(textLayer)
    return {
      n,
      recordMs: summarise(recordMs.slice(20)),
      ...prof,
      glyphBakes: glyphs.bakes,
      sprites: textLayer.count,
    }
  },

  /** Engine frame stats for an empty stage (the floor to subtract). */
  async perfEmpty(count = 30) {
    await mountStage(current!.world, 'none')
    await setCamera(current!.centre.x * TILE, current!.centre.y * TILE, current!.sc.zoom)
    const engine = stage.engine!
    const render: number[] = []
    const update: number[] = []
    for (let i = 0; i < count + 5; i++) {
      engine.loop.markDirty()
      await frames(1)
      const s = engine.stats ?? engine.getStats?.()
      if (s && i >= 5) {
        render.push(s.renderMs)
        update.push(s.updateMs)
      }
    }
    return { renderMs: summarise(render), updateMs: summarise(update) }
  },

  /** Run several parity scenarios in a row: `[{name, sc, features}]` -> one line each. */
  async matrix(list: { name: string; sc: Scenario; features: Partial<CfFeatures> }[]) {
    const rows: Record<string, unknown>[] = []
    for (const item of list) {
      await api.setup(item.sc, 'cf')
      const r = await api.compare(item.features)
      rows.push({
        name: item.name,
        sprites: r.sprites,
        cvMs: r.canvasMs,
        cfMs: r.cfUpdateMs,
        mean: r.diff.meanAbs,
        '>8%': r.diff.over8,
        '>24%': r.diff.over24,
        cover: r.diff.coveredPct,
        cMean: r.diff.coveredMeanAbs,
        c24: r.diff.coveredOver24,
        un: Object.keys(r.unsupported).join(','),
      })
    }
    return rows
  },

  stage,
  frames,
  readGl: () => readGl(stage.engine!.canvas),
}

window.__cf = api
out.textContent = 'ready: await __cf.init() then __cf.setup({zoom: 2}) then __cf.compare({atmosphere: true})'
