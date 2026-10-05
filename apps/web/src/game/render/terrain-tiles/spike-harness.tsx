/* eslint-disable react-refresh/only-export-components */
/**
 * Comparison harness for the terrain backends (open `/terrain-spike.html` on the dev server).
 *
 * It boots a wasm world, mounts the real `WorldSprite` inside a cubeforge `Game` with either the
 * `canvas` or the `tilelayer` terrain, and exposes `window.__spike` to move the camera, push world
 * changes, read the framebuffer back, diff the two backends and sample frame costs. Nothing here
 * ships: the page is not part of the production build.
 */
import { createRoot } from 'react-dom/client'
import { useEffect } from 'react'
import { Camera2D, Entity, Game, TileLayerData, World, useCamera, useGame } from 'cubeforge'
import type { EngineState, EngineStats } from 'cubeforge'
import init, { Sim } from '../../../wasm/sim-core/sim_core'
import { parseWorldFrame } from '../../../simulation/wire'
import { mergeFrame } from '../../../simulation/merge'
import { useUIStore } from '../../../state/store'
import type { InterpRefs } from '../../../simulation/useSimulation'
import type { WorldState } from '../../../shared/types'
import { TILE } from '../../model/palette'
import { WorldSprite } from '../world-view/WorldSprite'
import { setTerrainBackend } from '../terrain-backend'
import type { TerrainBackend } from '../terrain-backend'
import { terrainProbe } from './probe'
import { blockMeans, diffStats, meanBlockContrast } from './compare'
import type { DiffStats } from './compare'
import { emulateTerrainLayer } from './emulate'
import { createTerrainSyncState, syncTerrainLayer, terrainLod } from './sync'
import { TERRAIN_VARIANTS, getTerrainTileset } from './atlas'
import { paintTileBlock, terrainSeason } from '../base-layer'
import { terrainKind } from './tileset'
import { baseTerrainTile } from '../../model/terrain-visuals'

// Reading the framebuffer back needs the drawing buffer to survive the frame. Cubeforge creates its
// context without `preserveDrawingBuffer`, so the harness adds it, except for `?perf=1` pages
// where frame costs are measured as the app runs them.
if (!new URLSearchParams(location.search).has('perf')) {
  // Every animation reads Date.now(): freeze it so two renders of the same world are comparable.
  const frozenNow = Date.now()
  Date.now = () => frozenNow
  const original = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, attrs?: unknown) {
    if (type === 'webgl2') attrs = { ...(attrs as object), preserveDrawingBuffer: true }
    return (original as (t: string, a?: unknown) => unknown).call(this, type, attrs)
  } as typeof HTMLCanvasElement.prototype.getContext
}

const stage = document.getElementById('stage')!
const logEl = document.getElementById('log')!
const shots = document.getElementById('shots')!
const VIEW = { w: 960, h: 540 }

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
async function frames(n: number) {
  for (let i = 0; i < n; i++) await nextFrame()
}

interface Bridge {
  engine: EngineState | null
  setCamera: (x: number, y: number, zoom: number) => void
}
const bridge: Bridge = { engine: null, setCamera: () => undefined }
const camRef = { current: { x: 2400, y: 1200, zoom: 1 } }

function Bridge_() {
  const camera = useCamera()
  const engine = useGame()
  useEffect(() => {
    bridge.engine = engine
    bridge.setCamera = (x, y, zoom) => {
      camera.setZoom(zoom)
      camera.setPosition(x, y)
      camRef.current = { x, y, zoom }
      engine.loop.markDirty()
    }
    return () => {
      bridge.engine = null
    }
  }, [camera, engine])
  return null
}

let world: WorldState | null = null
let interp: InterpRefs | null = null
let root: ReturnType<typeof createRoot> | null = null
let epoch = 0
let currentMode: TerrainBackend = 'canvas'
let firstDrawResolve: (() => void) | null = null

function makeInterp(w: WorldState): InterpRefs {
  return {
    prev: { current: null },
    current: { current: w },
    prevServerAt: { current: 0 },
    currentServerAt: { current: 1 },
    currentReceivedAt: { current: performance.now() },
  }
}

function render() {
  if (!world || !interp) return
  root ??= createRoot(stage)
  const W = world.grid.width * TILE
  const H = world.grid.height * TILE
  root.render(
    <Game
      key={`${currentMode}-${epoch}`}
      mode="onDemand"
      gravity={0}
      width={VIEW.w}
      height={VIEW.h}
      style={{ display: 'block' }}
    >
      <World background="#1a4a80">
        <Camera2D />
        <Entity>
          <WorldSprite
            world={world}
            interp={interp}
            selectedOrgId={null}
            overlay={null}
            focus="all"
            viewFlags={useUIStore.getState().viewFlags}
            rendererPaused={false}
            onFirstDraw={() => firstDrawResolve?.()}
            onDrawError={(m) => {
              logEl.textContent += `\nDRAW ERROR ${m}`
            }}
            atX={W / 2}
            atY={H / 2}
            cameraStateRef={camRef}
            viewportDims={VIEW}
          />
        </Entity>
        <Bridge_ />
      </World>
    </Game>,
  )
}

async function loadWorld(seed = 42, ticks = 0): Promise<WorldState> {
  await init()
  const sim = new Sim(BigInt(seed))
  if (ticks > 0) sim.tickN(ticks)
  const parsed = parseWorldFrame(sim.fullFrame(1, Date.now()))
  sim.free()
  if (parsed.isErr()) throw new Error(String(parsed.error))
  const { next } = mergeFrame(parsed.value, {
    organisms: new Map(),
    animals: new Map(),
    grid: null,
    prevWorld: null,
  })
  world = next
  interp = makeInterp(next)
  return next
}

/** Mount (or remount) the Game with a backend. Resolves after the first painted frame. */
async function mount(mode: TerrainBackend, view?: { x: number; y: number; zoom: number }): Promise<number> {
  if (!world) throw new Error('load a world first')
  setTerrainBackend(mode)
  currentMode = mode
  epoch++
  if (view) camRef.current = view
  const t0 = performance.now()
  const ready = new Promise<void>((resolve) => {
    firstDrawResolve = resolve
  })
  render()
  await ready
  const ms = performance.now() - t0
  if (view) bridge.setCamera(view.x, view.y, view.zoom)
  await settle()
  return ms
}

/** Push a new world through the interp refs, as a sim frame would. */
async function pushWorld(next: WorldState) {
  world = next
  interp!.prev.current = interp!.current.current
  interp!.current.current = next
  interp!.prevServerAt.current = interp!.currentServerAt.current
  interp!.currentServerAt.current += 1
  interp!.currentReceivedAt.current = performance.now() - 5000
  await settle()
}

/** Wait until the world sprite has repainted for the current camera and the engine has drawn. */
async function settle() {
  await sleep(450)
  await frames(6)
  bridge.engine?.loop.markDirty()
  await frames(3)
}

async function setView(x: number, y: number, zoom: number) {
  bridge.setCamera(x, y, zoom)
  await settle()
}

function glCanvas(): HTMLCanvasElement {
  return stage.querySelector('canvas') as HTMLCanvasElement
}

/** Read the framebuffer: must run inside the animation frame that follows an engine render. */
function capture(): Promise<ImageData> {
  return new Promise((resolve) => {
    bridge.engine?.loop.markDirty()
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const c = glCanvas()
        const t = document.createElement('canvas')
        t.width = c.width
        t.height = c.height
        const ctx = t.getContext('2d', { willReadFrequently: true })!
        ctx.drawImage(c, 0, 0)
        resolve(ctx.getImageData(0, 0, t.width, t.height))
      }),
    )
  })
}

function tileLayer(): TileLayerData | null {
  const eng = bridge.engine
  if (!eng) return null
  const ids = eng.ecs.query('TileLayer')
  if (ids.length === 0) return null
  return (eng.ecs.getComponent(ids[0], 'TileLayer') as unknown as { layer: TileLayerData }).layer
}

function worldSpriteEntity(): number | null {
  const eng = bridge.engine
  if (!eng) return null
  const ids = eng.ecs.query('Transform', 'Sprite')
  return ids.length ? ids[0] : null
}

/** Show or hide the canvas sprite (everything but the TileLayer ground). */
function setCanvasSpriteVisible(visible: boolean) {
  const eng = bridge.engine
  const id = worldSpriteEntity()
  if (!eng || id === null) return
  const sprite = eng.ecs.getComponent(id, 'Sprite') as unknown as { visible: boolean }
  sprite.visible = visible
  eng.loop.markDirty()
}

function setTileLayerVisible(visible: boolean) {
  const layer = tileLayer()
  if (layer) {
    layer.visible = visible
    bridge.engine?.loop.markDirty()
  }
}

function setBackground(color: string) {
  const eng = bridge.engine
  if (!eng) return
  const id = eng.ecs.queryOne('Camera2D')
  if (id === undefined) return
  ;(eng.ecs.getComponent(id, 'Camera2D') as unknown as { background: string }).background = color
  eng.loop.markDirty()
}

/**
 * How much the canvas sprite covers each pixel (0..1), found by drawing it over black and over
 * white with the TileLayer hidden: out = a * c + (1 - a) * bg, so a = 1 - (white - black) / 255.
 */
async function coverageAlpha(): Promise<Float32Array> {
  setTileLayerVisible(false)
  setBackground('#000000')
  await frames(3)
  const onBlack = await capture()
  setBackground('#ffffff')
  await frames(3)
  const onWhite = await capture()
  setBackground('#1a4a80')
  setTileLayerVisible(true)
  await frames(2)
  const out = new Float32Array(onBlack.width * onBlack.height)
  for (let i = 0; i < out.length; i++) out[i] = 1 - (onWhite.data[i * 4 + 1] - onBlack.data[i * 4 + 1]) / 255
  return out
}

function toDataUrl(img: ImageData, sx = 0, sy = 0, sw = img.width, sh = img.height, scale = 1): string {
  const c = document.createElement('canvas')
  c.width = sw
  c.height = sh
  c.getContext('2d')!.putImageData(img, -sx, -sy, sx, sy, sw, sh)
  if (scale === 1) return c.toDataURL('image/png')
  const d = document.createElement('canvas')
  d.width = Math.round(sw * scale)
  d.height = Math.round(sh * scale)
  const dx = d.getContext('2d')!
  dx.imageSmoothingEnabled = false
  dx.drawImage(c, 0, 0, d.width, d.height)
  return d.toDataURL('image/png')
}

function diffImage(a: ImageData, b: ImageData, gain = 8): ImageData {
  const out = new ImageData(a.width, a.height)
  for (let i = 0; i < a.data.length; i += 4) {
    let worst = 0
    for (let c = 0; c < 3; c++) worst = Math.max(worst, Math.abs(a.data[i + c] - b.data[i + c]))
    const v = Math.min(255, worst * gain)
    out.data[i] = v
    out.data[i + 1] = v
    out.data[i + 2] = v
    out.data[i + 3] = 255
  }
  return out
}

function show(label: string, urls: string[]) {
  const row = document.createElement('div')
  row.style.margin = '6px 0'
  row.append(label)
  const strip = document.createElement('div')
  strip.style.display = 'flex'
  strip.style.gap = '4px'
  for (const u of urls) {
    const img = document.createElement('img')
    img.src = u
    img.style.width = `${Math.floor(940 / urls.length)}px`
    strip.append(img)
  }
  row.append(strip)
  shots.append(row)
}

function summarize(s: DiffStats) {
  const f = (n: number, d = 2) => Number(n.toFixed(d))
  return {
    px: s.pixels,
    meanAbs: f(s.meanAbs),
    rms: f(s.rms),
    bias: s.bias.map((v) => f(v)),
    max: s.maxAbs,
    gt2: f(s.over2 * 100, 1),
    gt4: f(s.over4 * 100, 1),
    gt8: f(s.over8 * 100, 1),
    gt16: f(s.over16 * 100, 1),
  }
}

/** Centre of a view with a mix of water, sand, grass and rock, snapped to the tile grid. */
function interestingCenter(zoom: number): { x: number; y: number } {
  const g = world!.grid
  const halfTilesX = Math.floor(VIEW.w / zoom / 2 / TILE)
  const halfTilesY = Math.floor(VIEW.h / zoom / 2 / TILE)
  let best = { x: g.width / 2, y: g.height / 2 }
  let bestScore = -1
  for (let cy = halfTilesY; cy < g.height - halfTilesY; cy += 6) {
    for (let cx = halfTilesX; cx < g.width - halfTilesX; cx += 6) {
      const seen = new Set<number>()
      const step = Math.max(2, Math.floor(halfTilesX / 6))
      for (let y = cy - halfTilesY; y < cy + halfTilesY; y += step) {
        for (let x = cx - halfTilesX; x < cx + halfTilesX; x += step) seen.add(g.tiles[y][x])
      }
      const score = seen.size
      if (score > bestScore) {
        bestScore = score
        best = { x: cx, y: cy }
      }
    }
  }
  return { x: best.x * TILE, y: best.y * TILE }
}

const VIEWS = [
  { name: 'overview', zoom: 0.2 },
  { name: 'wide', zoom: 0.5 },
  { name: 'mid', zoom: 1 },
  { name: 'mid-fractional', zoom: 1.37 },
  { name: 'close', zoom: 4 },
]

async function compareViews(names?: string[]) {
  const results: Record<string, unknown> = {}
  const dpr = devicePixelRatio
  for (const v of VIEWS) {
    if (names && !names.includes(v.name)) continue
    const c = interestingCenter(v.zoom)
    const view = { x: c.x, y: c.y, zoom: v.zoom }
    await mount('canvas', view)
    const a = await capture()
    await mount('tilelayer', view)
    const b = await capture()
    // Ground-dominant pixels: where the canvas sprite (trees, buildings, ...) covers less than half.
    const alpha = await coverageAlpha()
    const include = new Uint8Array(a.width * a.height)
    const overlaid = new Uint8Array(a.width * a.height)
    for (let i = 0; i < include.length; i++) {
      const bare = alpha[i] < 0.5
      include[i] = bare ? 1 : 0
      overlaid[i] = bare ? 0 : 1
    }
    const all = diffStats(a.data, b.data)
    const ground = diffStats(a.data, b.data, include)
    const covered = diffStats(a.data, b.data, overlaid)
    const dev = v.zoom * dpr * TILE
    const entry: Record<string, unknown> = {
      zoom: v.zoom,
      devicePxPerTile: Number(dev.toFixed(2)),
      size: [a.width, a.height],
      coveredShare: Number((100 * (1 - include.reduce((s, x) => s + x, 0) / include.length)).toFixed(1)),
      all: summarize(all),
      groundOnly: summarize(ground),
      overlaid: summarize(covered),
      contrastCanvas: Number(meanBlockContrast(a.data, a.width, a.height, 8).toFixed(2)),
      contrastTile: Number(meanBlockContrast(b.data, b.width, b.height, 8).toFixed(2)),
    }
    results[v.name] = entry
    const cropW = Math.min(a.width, 480)
    const cropH = Math.min(a.height, 300)
    const sx = Math.floor((a.width - cropW) / 2)
    const sy = Math.floor((a.height - cropH) / 2)
    show(`${v.name} zoom ${v.zoom} (crop ${cropW}x${cropH}): canvas | tilelayer | diff x8`, [
      toDataUrl(a, sx, sy, cropW, cropH),
      toDataUrl(b, sx, sy, cropW, cropH),
      toDataUrl(diffImage(a, b), sx, sy, cropW, cropH),
    ])
  }
  return results
}

/**
 * Shimmer: pan the camera in quarter-device-pixel steps and measure how much the picture changes
 * from one step to the next. Smooth sampling changes little; nearest sampling of a textured atlas
 * jumps between texels. Lower is calmer.
 */
async function shimmer(zoom: number, steps = 8) {
  const out: Record<string, unknown> = {}
  const c = interestingCenter(zoom)
  const stepWorld = 0.25 / (zoom * devicePixelRatio)
  for (const mode of ['canvas', 'tilelayer'] as const) {
    await mount(mode, { x: c.x, y: c.y, zoom })
    const imgs: ImageData[] = []
    for (let i = 0; i < steps; i++) {
      await setView(c.x + i * stepWorld, c.y, zoom)
      imgs.push(await capture())
    }
    let sum = 0
    let rms = 0
    let over4 = 0
    for (let i = 0; i + 1 < imgs.length; i++) {
      const d = diffStats(imgs[i].data, imgs[i + 1].data)
      sum += d.meanAbs
      rms += d.rms
      over4 += d.over4
    }
    const n = imgs.length - 1
    out[mode] = {
      meanAbsFrameToFrame: Number((sum / n).toFixed(3)),
      rmsFrameToFrame: Number((rms / n).toFixed(3)),
      gt4pct: Number(((over4 / n) * 100).toFixed(2)),
    }
  }
  return { zoom, devicePxPerTile: Number((zoom * devicePixelRatio * TILE).toFixed(2)), ...out }
}

/**
 * The same ground computed two ways for the whole world at 1:1, without a GPU: the canvas painter's
 * pixels (`paintTileBlock`) against the TileLayer model (tileset + tints + variant by tile hash).
 */
function cpuParity(w: WorldState, seasonOverride?: string) {
  const g = w.grid
  const season = seasonOverride ?? terrainSeason(w)
  const W = g.width * TILE
  const H = g.height * TILE
  const ref = new ImageData(W, H)
  const t0 = performance.now()
  for (let row = 0; row < g.height; row++) {
    for (let col = 0; col < g.width; col++) {
      paintTileBlock(ref.data, W, g.tiles, g.biomes, g.depth_map as number[][] | undefined, season, row, col)
    }
  }
  const canvasMs = performance.now() - t0
  const layer = new TileLayerData({
    width: g.width,
    height: g.height,
    tileset: getTerrainTileset(),
    variants: TERRAIN_VARIANTS,
    tinted: true,
    tileWorldWidth: TILE,
    tileWorldHeight: TILE,
  })
  const state = createTerrainSyncState()
  const r = syncTerrainLayer(layer, state, {
    width: g.width,
    height: g.height,
    tiles: g.tiles,
    biomes: g.biomes,
    depth_map: g.depth_map as number[][] | undefined,
    season,
  })
  const emu = emulateTerrainLayer(layer)
  const kindMap = new Uint8Array(W * H)
  for (let row = 0; row < g.height; row++) {
    for (let col = 0; col < g.width; col++) {
      const k = terrainKind(baseTerrainTile(g.tiles[row][col])) + 1
      for (let y = 0; y < TILE; y++)
        kindMap.fill(k, (row * TILE + y) * W + col * TILE, (row * TILE + y) * W + col * TILE + TILE)
    }
  }
  const names = ['void', 'grass', 'water', 'rock', 'ash', 'scorched', 'snow', 'sand']
  const perKind: Record<string, unknown> = {}
  for (let k = 0; k < names.length; k++) {
    const inc = new Uint8Array(W * H)
    let any = false
    for (let i = 0; i < inc.length; i++) {
      if (kindMap[i] === k + 1) {
        inc[i] = 1
        any = true
      }
    }
    if (any) perKind[names[k]] = summarize(diffStats(ref.data, emu, inc))
  }
  const bm = (img: ArrayLike<number>) => blockMeans(img, W, H, TILE)
  const refBlocks = bm(ref.data)
  const emuBlocks = bm(emu)
  const blockDiff = diffStats(refBlocks, emuBlocks)
  const tileStats = diffStats(ref.data, emu)
  return {
    season,
    canvasPaintMs: Number(canvasMs.toFixed(1)),
    tileSync: { kind: r.kind, ms: Number(r.ms.toFixed(1)) },
    perPixel: summarize(tileStats),
    perTileMean: summarize(blockDiff),
    contrastCanvas: Number(meanBlockContrast(ref.data, W, H, TILE).toFixed(2)),
    contrastTile: Number(meanBlockContrast(emu, W, H, TILE).toFixed(2)),
    perKind,
  }
}

function median(a: number[]) {
  const s = [...a].sort((x, y) => x - y)
  return s.length ? s[Math.floor(s.length / 2)] : 0
}
function pct(a: number[], p: number) {
  const s = [...a].sort((x, y) => x - y)
  return s.length ? s[Math.min(s.length - 1, Math.ceil(s.length * p) - 1)] : 0
}
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0)

interface FrameSample {
  renderMs: number
  updateMs: number
  drawCalls: number
  instances: number
  uploads: number
  uploadBytes: number
  tileUploads: number
  tileTexels: number
  tileDraws: number
  textureBytes: number
  frameInterval: number
}

function sampleStats(): FrameSample | null {
  const eng = bridge.engine
  const st = eng?.stats as EngineStats | undefined
  if (!eng || !st) return null
  const rs = eng.activeRenderSystem as unknown as {
    tileLayerStats?: { indexUploads: number; uploadedTexels: number; drawCalls: number }
  }
  const tl = rs.tileLayerStats
  return {
    renderMs: st.renderMs,
    updateMs: st.updateMs,
    drawCalls: st.render.drawCalls,
    instances: st.render.instances,
    uploads: st.render.textureUploads,
    uploadBytes: st.render.textureUploadBytes,
    tileUploads: tl?.indexUploads ?? 0,
    tileTexels: tl?.uploadedTexels ?? 0,
    tileDraws: tl?.drawCalls ?? 0,
    textureBytes: st.render.textureBytes,
    frameInterval: st.frameIntervalMs,
  }
}

/** Steady-state frame costs with a repaint on every sim tick for `seconds`. */
async function perf(seconds = 4) {
  terrainProbe.enabled = true
  terrainProbe.reset()
  const samples: FrameSample[] = []
  const end = performance.now() + seconds * 1000
  let lastTick = 0
  while (performance.now() < end) {
    await nextFrame()
    const now = performance.now()
    if (now - lastTick > 50 && interp) {
      lastTick = now
      // A new sim frame arrived: the people move and the sprite repaints.
      interp.prev.current = interp.current.current
      interp.prevServerAt.current = interp.currentServerAt.current
      interp.currentServerAt.current += 1
      interp.currentReceivedAt.current = now
    }
    const s = sampleStats()
    if (s) samples.push(s)
  }
  terrainProbe.enabled = false
  const f = (n: number) => Number(n.toFixed(2))
  const col = (k: keyof FrameSample) => samples.map((s) => s[k])
  // Only frames the engine actually rendered (it reports the last one otherwise).
  const heavy = samples.filter((s) => s.uploads > 0)
  const hv = (k: keyof FrameSample) => heavy.map((s) => s[k])
  return {
    mode: currentMode,
    seconds,
    paintSamples: terrainProbe.paint.length,
    paintMs: {
      mean: f(mean(terrainProbe.paint)),
      p50: f(median(terrainProbe.paint)),
      p95: f(pct(terrainProbe.paint, 0.95)),
    },
    syncSamples: terrainProbe.sync.length,
    engineRenderMs: { mean: f(mean(col('renderMs'))), p95: f(pct(col('renderMs'), 0.95)) },
    engineUpdateMs: { mean: f(mean(col('updateMs'))), p95: f(pct(col('updateMs'), 0.95)) },
    drawCalls: f(mean(col('drawCalls'))),
    instances: f(mean(col('instances'))),
    textureUploadsPerRenderedFrame: f(mean(hv('uploads'))),
    textureUploadBytesPerRenderedFrame: Math.round(mean(hv('uploadBytes'))),
    tileLayerIndexUploads: f(mean(col('tileUploads'))),
    tileLayerTexels: Math.round(mean(col('tileTexels'))),
    tileLayerDraws: f(mean(col('tileDraws'))),
    textureBytes: Math.round(mean(col('textureBytes'))),
    frameIntervalMs: f(mean(col('frameInterval'))),
    renderedFrames: heavy.length,
  }
}

/**
 * Cold start of one backend (run on a freshly loaded `?perf=1` page): time to the first painted
 * frame, what the first paint and the terrain build cost, heap growth, then steady-state frames
 * at the given zoom.
 */
async function cold(mode: TerrainBackend, zoom: number, seconds = 4) {
  terrainProbe.enabled = true
  terrainProbe.reset()
  const heap0 = heap()
  const c = interestingCenter(zoom)
  const mountMs = await mount(mode, { x: c.x, y: c.y, zoom })
  const firstPaints = [...terrainProbe.paint]
  const firstSyncs = terrainProbe.sync.map((s) => ({ ...s, ms: Number(s.ms.toFixed(1)) }))
  const heap1 = heap()
  const steady = await perf(seconds)
  const heap2 = heap()
  return {
    mode,
    zoom,
    mountToFirstDrawMs: Number(mountMs.toFixed(0)),
    firstPaintMs: firstPaints.slice(0, 3).map((n) => Number(n.toFixed(1))),
    firstSyncs,
    heapMB: { before: heap0, afterFirstDraw: heap1, afterSteady: heap2 },
    steady,
  }
}

function heap() {
  const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
  return m ? Math.round(m.usedJSHeapSize / 1048576) : null
}

const api = {
  loadWorld,
  mount,
  setView,
  pushWorld,
  capture,
  compareViews,
  shimmer,
  cpuParity: () => cpuParity(world!),
  cpuParitySeason: (season: string) => cpuParity(world!, season),
  perf,
  cold,
  heap,
  frames,
  sleep,
  setTileLayerVisible,
  setCanvasSpriteVisible,
  tileLayer,
  probe: terrainProbe,
  lod: terrainLod,
  engine: () => bridge.engine,
  world: () => world,
  interestingCenter,
  diffImage,
  diffStats,
  blockMeans,
  emulateTerrainLayer,
  toDataUrl,
  show,
  summarize,
  clearShots: () => {
    shots.textContent = ''
  },
  bridge,
}
declare global {
  interface Window {
    __spike: typeof api
  }
}
window.__spike = api
logEl.textContent = 'ready: window.__spike'
