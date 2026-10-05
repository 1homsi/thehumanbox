/**
 * Dev page (apps/web/cf-benchmark.html): renders the real WorldView over a
 * synthetic world twice, once with the canvas painter and once with the
 * SpriteLayer people/animals (`?cf=people,animals`), and compares them.
 *
 *   await cfBench.init({ ticks: 1500 })
 *   await cfBench.mount('canvas')              // or 'cf'
 *   await cfBench.camera(tx, ty, zoom)
 *   cfBench.snapshot('canvas')                 // read the GL canvas back
 *   ... same for 'cf' ...
 *   cfBench.diff('canvas', 'cf')               // pixel differences
 *   await cfBench.measure(4000)                // CPU, draw calls, frame cadence
 *
 * Nothing here ships to players: it is not imported by the app.
 */
import { createRoot, type Root } from 'react-dom/client'
import type { EngineState } from 'cubeforge'
import init, { Sim } from '../../../wasm/sim-core/sim_core'
import { parseWorldFrame } from '../../../simulation/wire'
import { mergeFrame } from '../../../simulation/merge'
import type { InterpRefs } from '../../../simulation/useSimulation'
import type { OrganismState, WorldState } from '../../../shared/types'
import { useCameraFocus } from '../../../state/camera-focus'
import { useUIStore } from '../../../state/store'
import { TILE } from '../../model/palette'
import { WorldView } from '../WorldView'
import { cfPerf, pickPersonAt } from './people/bridge'

// The page is often driven from a tab the browser considers hidden: the app and
// the engine skip frames then, so pretend to be visible.
Object.defineProperty(document, 'hidden', { get: () => false, configurable: true })
Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true })

// Keep the GL back buffer so the canvas can be read back after it was shown.
const getContext = HTMLCanvasElement.prototype.getContext as (...args: unknown[]) => unknown
;(HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext = function (
  this: HTMLCanvasElement,
  type: string,
  options?: Record<string, unknown>,
) {
  return getContext.call(
    this,
    type,
    type === 'webgl2' ? { ...options, preserveDrawingBuffer: true } : options,
  )
}

const log = document.querySelector<HTMLPreElement>('#log')!
const stage = document.querySelector<HTMLDivElement>('#stage')!
const out = document.querySelector<HTMLDivElement>('#out')!
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
async function frames(n: number) {
  for (let i = 0; i < n; i++) await nextFrame()
}

let base: WorldState | null = null
let world: WorldState | null = null
let root: Root | null = null
let mode: 'canvas' | 'cf' | null = null
const realNow = Date.now.bind(Date)
let flowTimer = 0
const interp: InterpRefs = {
  current: { current: null },
  prev: { current: null },
  currentServerAt: { current: 100 },
  prevServerAt: { current: 0 },
  currentReceivedAt: { current: -1_000_000 },
}

function setWorld(next: WorldState) {
  world = next
  interp.current.current = next
  interp.prev.current = next
  interp.currentReceivedAt.current = -1_000_000
}

function probe() {
  const p = (
    window as unknown as {
      __thbCf?: { engine: EngineState; camera: { current: { x: number; y: number; zoom: number } } }
    }
  ).__thbCf
  if (!p) throw new Error('probe missing: mount first')
  return p
}

function container(): HTMLElement {
  return stage.querySelector<HTMLElement>('.map2d-world')!
}

async function initWorld({ seed = 42, ticks = 1500 }: { seed?: number; ticks?: number } = {}) {
  await init()
  const sim = new Sim(BigInt(seed))
  sim.tickN(ticks)
  const parsed = parseWorldFrame(sim.fullFrame(1, realNow()))
  sim.free()
  if (parsed.isErr()) throw new Error(String(parsed.error))
  const merged = mergeFrame(parsed.value, {
    organisms: new Map(),
    animals: new Map(),
    grid: null,
    prevWorld: null,
  })
  const w = merged.next
  w.viewport_organisms = w.organisms
  w.viewport_animals = w.animals
  base = w
  setWorld(w)
  const alive = w.organisms.filter((o) => o.alive)
  return { people: alive.length, animals: w.animals.length, grid: [w.grid.width, w.grid.height], ticks }
}

/** `count` people spread over a 64x48 tile patch around (cx, cy), made from the sim's own people. */
function crowd(count: number, cx: number, cy: number, animals = 0) {
  if (!base) throw new Error('init first')
  const templates = base.organisms.filter((o) => o.alive)
  const orgs: OrganismState[] = Array.from({ length: count }, (_, i) => ({
    ...templates[i % templates.length],
    id: `crowd-${i}`,
    name: `P${i}`,
    x: cx - 32 + ((i * 17.13) % 64),
    y: cy - 24 + ((i * 7.71) % 48),
    thought: 'exploring',
    home_x: -1000,
    home_y: -1000,
    sleep_debt: 0,
    energy: 0.6,
    health: 0.9,
  }))
  const kinds = ['deer', 'sheep', 'cow', 'rabbit', 'wolf', 'bear', 'fish', 'bird', 'horse', 'chicken']
  const extra = Array.from({ length: animals }, (_, i) => ({
    id: 10_000 + i,
    kind: kinds[i % kinds.length] as WorldState['animals'][number]['kind'],
    x: cx - 32 + ((i * 11.3) % 64),
    y: cy - 24 + ((i * 5.9) % 48),
  }))
  const next = { ...base, organisms: orgs, viewport_organisms: orgs, animals: [...base.animals, ...extra] }
  next.viewport_animals = next.animals
  setWorld(next)
  return { people: count, animals: next.animals.length }
}

/**
 * A grid of people and animals that between them use every sprite, decal and
 * icon the layers draw: leaders, vitals, sickness, tools, boats, sleepers.
 */
function showcase(cx: number, cy: number) {
  if (!base) throw new Error('init first')
  const templates = base.organisms.filter((o) => o.alive)
  const specialties = ['farmer', 'smith', 'hunter', 'healer', 'scholar', 'merchant', 'soldier', 'builder']
  const orgs: OrganismState[] = []
  const variants: Array<Partial<OrganismState>> = [
    {},
    { is_leader: true },
    { energy: 0.1, hydration: 0.15, health: 0.18 },
    { infection: 0.6, diseases: [{ kind: 'flu', started_tick: 1 }] },
    { specialty: 'smith', tools: { hammer: 1 }, degrees: ['law'] },
    { carrying: 2, carrying_type: 2 },
    { thought: 'sounding alarm' },
    { thought: 'challenging' },
    { fear_level: 0.9 },
    { grief_ticks: 40 },
    { pregnant: true, sex: 'female' },
    { age_stage: 'infant', age: 1 },
    { age_stage: 'child', age: 5 },
    { age_stage: 'elder', age: 70 },
    { thought: 'sleeping', sleep_debt: 0.9, home_x: 0, home_y: 0 },
    { is_leader: true, energy: 0.1, specialty: 'priest', tools: { rifle: 1 } },
  ]
  variants.forEach((v, i) => {
    const t = templates[i % templates.length]
    orgs.push({
      ...t,
      id: `show-${i}`,
      name: `S${i}`,
      x: cx - 12 + (i % 8) * 3,
      y: cy - 6 + Math.floor(i / 8) * 4,
      thought: 'exploring',
      home_x: -1000,
      home_y: -1000,
      sleep_debt: 0,
      energy: 0.6,
      hydration: 0.6,
      health: 0.9,
      infection: 0,
      carrying: 0,
      fear_level: 0,
      grief_ticks: 0,
      diseases: [],
      tools: {},
      degrees: [],
      specialty: specialties[i % specialties.length],
      pregnant: false,
      is_leader: false,
      ...v,
    } as OrganismState)
  })
  // two boats with riders and one empty boat
  const riders = [orgs[0], orgs[3]]
  const vehicles = [
    { id: 1, kind: 'boat', x: riders[0].x, y: riders[0].y, rider_id: riders[0].id },
    { id: 2, kind: 'boat', x: riders[1].x, y: riders[1].y, rider_id: riders[1].id, building: true },
    { id: 3, kind: 'boat', x: cx + 6, y: cy + 6 },
  ]
  const kinds = [
    'rabbit',
    'deer',
    'boar',
    'bird',
    'fish',
    'wolf',
    'dog',
    'bear',
    'sheep',
    'cow',
    'horse',
    'chicken',
    'zombie',
    'demon',
    'dragon',
    'alien',
    'ufo',
  ]
  const animals = kinds.map((kind, i) => ({
    id: 20_000 + i,
    kind: kind as WorldState['animals'][number]['kind'],
    x: cx - 12 + (i % 9) * 3,
    y: cy + 4 + Math.floor(i / 9) * 4,
    sleeping: kind === 'bear' || kind === 'deer',
  }))
  const next = {
    ...base,
    organisms: orgs,
    viewport_organisms: orgs,
    animals,
    viewport_animals: animals,
    vehicles,
    lineage_eras: Object.fromEntries(orgs.map((o) => [o.lineage_id, 'iron'])),
  } as WorldState
  setWorld(next)
  return { people: orgs.length, animals: animals.length, selected: orgs[2].id }
}

function restore() {
  if (base) setWorld(base)
}

/** Frames arrive every 100 ms and everyone walks about a tile a second, like the live app. */
function flow(on: boolean, hz = 10) {
  clearInterval(flowTimer)
  if (!on || !world) return
  let step = 0
  flowTimer = window.setInterval(() => {
    const cur = interp.current.current!
    const dir = Math.floor(step++ / 30) % 2 === 0 ? 1 : -1
    const move = <T extends { x: number; y: number }>(list: T[], speed: number) =>
      list.map((o, i) => ({
        ...o,
        x: o.x + Math.cos(i) * (speed / hz) * dir,
        y: o.y + Math.sin(i * 1.7) * (speed / hz) * dir,
      }))
    const orgs = move(cur.organisms, 1)
    const animals = move(cur.animals, 0.6)
    const next: WorldState = {
      ...cur,
      organisms: orgs,
      viewport_organisms: orgs,
      animals,
      viewport_animals: animals,
      frame_id: cur.frame_id + 1,
    }
    interp.prev.current = cur
    interp.current.current = next
    interp.prevServerAt.current = interp.currentServerAt.current
    interp.currentServerAt.current += 1000 / hz
    interp.currentReceivedAt.current = performance.now()
    world = next
  }, 1000 / hz)
}

async function mount(which: 'canvas' | 'cf', size = { w: 1000, h: 640 }) {
  flow(false)
  if (root) {
    root.unmount()
    root = null
    await frames(2)
  }
  stage.style.display = 'flex'
  stage.style.width = `${size.w}px`
  stage.style.height = `${size.h}px`
  // cfFlag reads the URL on every call, so the page picks the renderer through ?cf=
  const params = new URLSearchParams(location.search)
  params.set('cf', which === 'cf' ? 'people,animals,probe' : 'probe')
  history.replaceState(null, '', `${location.pathname}?${params.toString().replace(/%2C/g, ',')}`)
  mode = which
  root = createRoot(stage)
  root.render(<WorldView world={world!} interp={interp} />)
  for (let i = 0; i < 400 && !(window as unknown as { __thbCf?: unknown }).__thbCf; i++) await sleep(50)
  await sleep(1500)
  await frames(5)
  return { mode: which, camera: { ...probe().camera.current } }
}

/** Put the camera on tile (tx, ty) at `zoom`, using the controls a player has (focus, then the wheel). */
async function camera(tx: number, ty: number, zoom: number) {
  const el = container()
  const rect = el.getBoundingClientRect()
  useCameraFocus.getState().focusTile(tx, ty)
  await sleep(200)
  await frames(3)
  for (let i = 0; i < 40; i++) {
    const current = probe().camera.current.zoom
    if (Math.abs(current / zoom - 1) < 0.01) break
    const delta = Math.max(-160, Math.min(160, -Math.log(zoom / current) / 0.0025))
    el.dispatchEvent(
      new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        deltaY: delta,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      }),
    )
    await frames(2)
  }
  await sleep(500)
  await frames(4)
  return { ...probe().camera.current }
}

function freezeTime(at: number | null) {
  Date.now = at === null ? realNow : () => at
}

const snapshots = new Map<string, ImageData>()

function snapshot(name: string) {
  const el = container()
  const gl = el.querySelector('canvas')!
  const copy = document.createElement('canvas')
  copy.width = gl.width
  copy.height = gl.height
  const ctx = copy.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(gl, 0, 0)
  const data = ctx.getImageData(0, 0, copy.width, copy.height)
  snapshots.set(name, data)
  return { name, width: copy.width, height: copy.height }
}

function show(name: string, data: ImageData, amplify = 1) {
  const c = document.createElement('canvas')
  c.width = data.width
  c.height = data.height
  c.title = name
  const ctx = c.getContext('2d')!
  if (amplify !== 1)
    for (let i = 0; i < data.data.length; i += 4)
      for (let k = 0; k < 3; k++) data.data[i + k] = Math.min(255, data.data[i + k] * amplify)
  ctx.putImageData(data, 0, 0)
  out.append(c)
}

/** How far apart two snapshots are: mean error per channel and the share of pixels that visibly differ. */
function diff(a: string, b: string, draw = true) {
  const A = snapshots.get(a)!
  const B_ = snapshots.get(b)!
  const n = A.width * A.height
  const d = new ImageData(A.width, A.height)
  let sum = 0
  let over8 = 0
  let over32 = 0
  let over64 = 0
  let maxDiff = 0
  for (let p = 0; p < n; p++) {
    const i = p * 4
    const dr = Math.abs(A.data[i] - B_.data[i])
    const dg = Math.abs(A.data[i + 1] - B_.data[i + 1])
    const db = Math.abs(A.data[i + 2] - B_.data[i + 2])
    const m = Math.max(dr, dg, db)
    sum += dr + dg + db
    if (m > 8) over8++
    if (m > 32) over32++
    if (m > 64) over64++
    if (m > maxDiff) maxDiff = m
    d.data[i] = dr
    d.data[i + 1] = dg
    d.data[i + 2] = db
    d.data[i + 3] = 255
  }
  if (draw) {
    out.replaceChildren()
    show(a, new ImageData(new Uint8ClampedArray(A.data), A.width, A.height))
    show(b, new ImageData(new Uint8ClampedArray(B_.data), B_.width, B_.height))
    show(`${a} vs ${b} x4`, d, 4)
  }
  // Mean error after averaging 8x8 blocks: ignores how a pixel edge was filtered, keeps where colour is.
  const B = 8
  let blockSum = 0
  let blocks = 0
  for (let by = 0; by + B <= A.height; by += B) {
    for (let bx = 0; bx + B <= A.width; bx += B) {
      for (let c = 0; c < 3; c++) {
        let sa = 0
        let sb = 0
        for (let y = 0; y < B; y++)
          for (let x = 0; x < B; x++) {
            const i = ((by + y) * A.width + bx + x) * 4 + c
            sa += A.data[i]
            sb += B_.data[i]
          }
        blockSum += Math.abs(sa - sb) / (B * B)
      }
      blocks++
    }
  }
  return {
    pixels: n,
    blockMeanAbsError: +(blockSum / (blocks * 3)).toFixed(4),
    meanAbsError: +(sum / (n * 3)).toFixed(4),
    pctOver8: +((over8 / n) * 100).toFixed(4),
    pctOver32: +((over32 / n) * 100).toFixed(4),
    pctOver64: +((over64 / n) * 100).toFixed(4),
    maxDiff,
  }
}

/** Side-by-side crops of two snapshots, enlarged with nearest-neighbour, plus their difference. */
function crops(a: string, b: string, x: number, y: number, w: number, h: number, scale = 4) {
  const A = snapshots.get(a)!
  const B_ = snapshots.get(b)!
  out.replaceChildren()
  const panel = (data: ImageData, label: string, amplify = 1) => {
    const src = document.createElement('canvas')
    src.width = w
    src.height = h
    const sctx = src.getContext('2d')!
    const piece = new ImageData(w, h)
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++)
        for (let c = 0; c < 4; c++)
          piece.data[(j * w + i) * 4 + c] = data.data[((y + j) * data.width + x + i) * 4 + c]
    if (amplify !== 1)
      for (let i = 0; i < piece.data.length; i += 4)
        for (let c = 0; c < 3; c++) piece.data[i + c] = Math.min(255, piece.data[i + c] * amplify)
    sctx.putImageData(piece, 0, 0)
    const big = document.createElement('canvas')
    big.width = w * scale
    big.height = h * scale
    big.title = label
    const bctx = big.getContext('2d')!
    bctx.imageSmoothingEnabled = false
    bctx.drawImage(src, 0, 0, w * scale, h * scale)
    big.style.width = `${w * scale}px`
    out.append(big)
  }
  const d = new ImageData(A.width, A.height)
  for (let i = 0; i < d.data.length; i += 4) {
    for (let c = 0; c < 3; c++) d.data[i + c] = Math.abs(A.data[i + c] - B_.data[i + c])
    d.data[i + 3] = 255
  }
  panel(A, a)
  panel(B_, b)
  panel(d, 'diff x3', 3)
}

/** Counters over a window of real frames. */
async function measure(ms: number) {
  const p = probe()
  const stats = p.engine.getStats?.() ?? p.engine.stats
  if (!stats) throw new Error('engine stats unavailable')
  const gl = p.engine.canvas.getContext('webgl2') as WebGL2RenderingContext | null
  const before = { ...cfPerf }
  const startFrames = stats.frame
  const startRendered = stats.render.frames
  let engineUpdateMs = 0
  let engineRenderMs = 0
  let drawCalls = 0
  let instances = 0
  let uploadBytes = 0
  let uploads = 0
  let sampled = 0
  let lastSeen = -1
  let lastRendered = stats.render.frames
  const deltas: number[] = []
  let gpuWait = 0
  let gpuSamples = 0
  const t0 = performance.now()
  let last = t0
  await new Promise<void>((resolve) => {
    const tick = (now: number) => {
      deltas.push(now - last)
      last = now
      if (stats.frame !== lastSeen) {
        lastSeen = stats.frame
        sampled++
        engineUpdateMs += stats.updateMs
        engineRenderMs += stats.renderMs
        if (stats.render.frames !== lastRendered) {
          lastRendered = stats.render.frames
          drawCalls += stats.render.drawCalls
          instances += stats.render.instances
          uploadBytes += stats.render.textureUploadBytes
          uploads += stats.render.textureUploads
        }
      }
      if (gl && sampled % 8 === 0) {
        const s = performance.now()
        gl.finish()
        gpuWait += performance.now() - s
        gpuSamples++
      }
      if (now - t0 < ms) requestAnimationFrame(tick)
      else resolve()
    }
    requestAnimationFrame(tick)
  })
  const seconds = (performance.now() - t0) / 1000
  const rendered = stats.render.frames - startRendered
  deltas.shift()
  deltas.sort((x, y) => x - y)
  const after = { ...cfPerf }
  const d = (k: keyof typeof cfPerf) => after[k] - before[k]
  const perSecond = (v: number) => +(v / seconds).toFixed(2)
  const avg = (total: number, count: number) => (count ? +(total / count).toFixed(3) : 0)
  const painterMs = d('canvasPaintMs')
  const spriteMs = d('peopleAnimateMs') + d('peopleRebuildMs') + d('animalAnimateMs') + d('animalRebuildMs')
  return {
    mode,
    seconds: +seconds.toFixed(2),
    rafFps: perSecond(deltas.length),
    rafIntervalMean: +(deltas.reduce((s, v) => s + v, 0) / deltas.length).toFixed(2),
    rafIntervalP95: +deltas[Math.floor(deltas.length * 0.95)].toFixed(2),
    rafIntervalMax: +deltas[deltas.length - 1].toFixed(2),
    engineFramesPerSec: perSecond(stats.frame - startFrames),
    renderedFramesPerSec: perSecond(rendered),
    engineUpdateMsPerFrame: avg(engineUpdateMs, sampled),
    engineRenderMsPerFrame: avg(engineRenderMs, sampled),
    drawCallsPerFrame: avg(drawCalls, rendered),
    instancesPerFrame: avg(instances, rendered),
    textureUploadsPerFrame: avg(uploads, rendered),
    textureUploadMBPerFrame: avg(uploadBytes / 1e6, rendered),
    canvasPaintsPerSec: perSecond(d('canvasPaints')),
    canvasPaintMsPerPaint: avg(painterMs, d('canvasPaints')),
    peopleFramesPerSec: perSecond(d('peopleFrames')),
    peopleRebuildsPerSec: perSecond(d('peopleRebuilds')),
    animalFramesPerSec: perSecond(d('animalFrames')),
    peopleAnimateMsPerFrame: avg(d('peopleAnimateMs'), d('peopleFrames')),
    peopleRebuildMs: avg(d('peopleRebuildMs'), d('peopleRebuilds')),
    animalAnimateMsPerFrame: avg(d('animalAnimateMs'), d('animalFrames')),
    animalRebuildMs: avg(d('animalRebuildMs'), d('animalRebuilds')),
    // Main-thread milliseconds the renderer's own code spends per second of wall time.
    rendererCpuMsPerSec: perSecond(painterMs + spriteMs + engineUpdateMs),
    gpuFinishMs: avg(gpuWait, gpuSamples),
  }
}

/** Compare the click that selects someone: the sprite hit against the old nearest-person search. */
function pickAgreement(samples = 400) {
  if (!world) throw new Error('init first')
  const orgs = (world.viewport_organisms ?? world.organisms).filter((o) => o.alive)
  const ox = world.grid.origin_x ?? 0
  const oy = world.grid.origin_y ?? 0
  const zoom = probe().camera.current.zoom
  const radius = Math.min(5, Math.max(1.2, 16 / (TILE * zoom)))
  let agree = 0
  let spriteHit = 0
  let oldHit = 0
  let spriteOnly = 0
  let oldOnly = 0
  let different = 0
  let used = 0
  for (let s = 0; s < samples; s++) {
    const o = orgs[(s * 7919) % orgs.length]
    // a click somewhere around a person: within ~2 tiles
    const wx = o.x + (((s * 37) % 100) / 100 - 0.5) * 4
    const wy = o.y + (((s * 53) % 100) / 100 - 0.5) * 4
    const hit = pickPersonAt((wx - ox) * TILE, (wy - oy) * TILE)
    if (hit === undefined) throw new Error('sprite layer not running')
    let nearest: string | null = null
    let best = radius
    for (const p of orgs) {
      const d = Math.hypot(p.x - wx, p.y - wy)
      if (d < best) {
        best = d
        nearest = p.id
      }
    }
    if (nearest && best >= 1.2) nearest = null
    used++
    if (hit) spriteHit++
    if (nearest) oldHit++
    if (hit && nearest && hit === nearest) agree++
    else if (hit && !nearest) spriteOnly++
    else if (!hit && nearest) oldOnly++
    else if (hit && nearest) different++
  }
  return { samples: used, spriteHit, oldHit, agree, spriteOnly, oldOnly, differentPerson: different, zoom }
}

/** The tile with the most people within 8 tiles: somewhere worth pointing the camera. */
function densest() {
  if (!world) throw new Error('init first')
  const alive = world.organisms.filter((o) => o.alive)
  let best = { x: 0, y: 0, n: -1 }
  for (const o of alive) {
    let n = 0
    for (const p of alive) if (Math.abs(p.x - o.x) < 8 && Math.abs(p.y - o.y) < 6) n++
    if (n > best.n) best = { x: Math.round(o.x), y: Math.round(o.y), n }
  }
  return best
}

/** Render the same frozen frame both ways at one camera and compare the GL canvases. */
async function parity(name: string, tx: number, ty: number, zoom: number, size = { w: 900, h: 560 }) {
  freezeTime(1_700_000_000_000)
  await mount('canvas', size)
  const camA = await camera(tx, ty, zoom)
  await sleep(500)
  snapshot(`${name}-canvas`)
  await mount('cf', size)
  const camB = await camera(tx, ty, zoom)
  await sleep(700)
  snapshot(`${name}-cf`)
  return { name, cameraCanvas: camA, cameraCf: camB, ...diff(`${name}-canvas`, `${name}-cf`) }
}

const api = {
  showcase,
  parity,
  init: initWorld,
  densest,
  crowd,
  restore,
  flow,
  mount,
  camera,
  freezeTime,
  snapshot,
  diff,
  crops,
  measure,
  pickAgreement,
  frames,
  sleep,
  probe: () => ({ ...probe().camera.current, perf: { ...cfPerf } }),
  ui: useUIStore,
}
;(window as unknown as { cfBench: typeof api }).cfBench = api
log.textContent = 'cfBench ready: init -> mount -> camera -> snapshot/diff/measure'
