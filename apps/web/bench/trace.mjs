// Turns a Chrome trace of the measured window into the numbers the benchmark reports.

export const TRACE_CATEGORIES = [
  'devtools.timeline',
  'disabled-by-default-devtools.timeline',
  'disabled-by-default-devtools.timeline.frame',
  'blink.user_timing',
  'v8',
  'v8.gc',
  'cc',
  'viz',
  'gpu',
]

const sum = (xs) => xs.reduce((a, b) => a + b, 0)
const pct = (x) => Math.round(x * 100) / 100

/**
 * @param events the trace events (Tracing.dataCollected)
 * Times are microseconds. The window is delimited by the page's `bench-start` / `bench-end` marks.
 */
export function analyzeTrace(events) {
  const procName = new Map()
  const threadName = new Map()
  let start = null
  let end = null
  for (const e of events) {
    if (e.ph === 'M' && e.name === 'process_name') procName.set(e.pid, e.args?.name)
    else if (e.ph === 'M' && e.name === 'thread_name') threadName.set(`${e.pid}:${e.tid}`, e.args?.name)
    else if (e.name === 'bench-start' && start === null) start = e.ts
    else if (e.name === 'bench-end' && end === null) end = e.ts
  }
  if (start === null || end === null) return { traceError: 'bench marks missing from the trace' }
  const windowUs = end - start
  const inWindow = events.filter((e) => e.ts >= start && e.ts <= end)
  const threadOf = (e) => threadName.get(`${e.pid}:${e.tid}`) ?? ''

  // The page's renderer: the process whose main thread ran the most tasks.
  const runTasks = inWindow.filter((e) => e.ph === 'X' && e.name === 'RunTask')
  const mainCounts = new Map()
  for (const e of runTasks)
    if (threadOf(e) === 'CrRendererMain') mainCounts.set(e.pid, (mainCounts.get(e.pid) ?? 0) + e.dur)
  const rendererPid = [...mainCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  const gpuPid = [...procName.entries()].find(([, n]) => n === 'GPU Process')?.[0]

  const busy = (pid, name) =>
    sum(runTasks.filter((e) => e.pid === pid && threadOf(e) === name).map((e) => e.dur)) / windowUs
  const main = runTasks.filter((e) => e.pid === rendererPid && threadOf(e) === 'CrRendererMain')
  const out = {
    traceWindowMs: Math.round(windowUs / 1000),
    traceMainBusyPct: pct(busy(rendererPid, 'CrRendererMain') * 100),
    compositorBusyPct: pct(busy(rendererPid, 'Compositor') * 100),
    gpuMainBusyPct: pct(busy(gpuPid, 'CrGpuMain') * 100),
    vizBusyPct: pct(busy(gpuPid, 'VizCompositorThread') * 100),
    mainTasks: main.length,
    traceLongTasks: main.filter((e) => e.dur > 50_000).length,
    maxTaskMs: pct(Math.max(0, ...main.map((e) => e.dur)) / 1000),
  }
  const rasterEvents = runTasks.filter(
    (e) => e.pid === rendererPid && /CompositorTileWorker/.test(threadOf(e)),
  )
  out.rasterBusyPct = pct((sum(rasterEvents.map((e) => e.dur)) / windowUs) * 100)

  // Frames: main-thread frames the page produced, and frames the compositor drew.
  const mainFrames = inWindow.filter((e) => e.pid === rendererPid && e.name === 'BeginMainThreadFrame')
  const draws = inWindow.filter((e) => e.pid === rendererPid && e.name === 'DrawFrame')
  const commits = inWindow.filter((e) => e.pid === rendererPid && e.name === 'Commit' && e.ph === 'X')
  const swaps = inWindow.filter((e) => e.pid === gpuPid && e.name === 'Display::DrawAndSwap')
  const secs = windowUs / 1e6
  out.mainFrames = mainFrames.length
  out.commits = commits.length
  out.drawFrames = draws.length
  out.swaps = swaps.length
  // Frames delivered are the ones the compositor drew. A page can ask the main thread for more
  // frames than it draws (an animation loop that changes nothing), and those are not delivered.
  out.fps = pct((swaps.length || draws.length) / secs)
  out.mainFps = pct((commits.length || mainFrames.length) / secs)

  // Garbage collection on the main thread.
  const gc = inWindow.filter(
    (e) =>
      e.pid === rendererPid &&
      e.ph === 'X' &&
      (e.name === 'MinorGC' || e.name === 'MajorGC') &&
      threadOf(e) === 'CrRendererMain',
  )
  out.gcCount = gc.length
  out.gcPauseMs = pct(sum(gc.map((e) => e.dur)) / 1000)
  out.gcMaxMs = pct(Math.max(0, ...gc.map((e) => e.dur)) / 1000)
  out.gcMajor = gc.filter((e) => e.name === 'MajorGC').length

  // Script time by kind, so a heavy frame shows where it went.
  const byName = {}
  for (const e of inWindow) {
    if (e.pid !== rendererPid || e.ph !== 'X' || threadOf(e) !== 'CrRendererMain') continue
    if (
      [
        'FunctionCall',
        'EvaluateScript',
        'V8.Compile',
        'UpdateLayoutTree',
        'Layout',
        'Paint',
        'PrePaint',
        'UpdateLayer',
        'Layerize',
        'Commit',
        'RunMicrotasks',
        'TimerFire',
        'FireAnimationFrame',
        'EventDispatch',
        'MinorGC',
        'MajorGC',
      ].includes(e.name)
    ) {
      byName[e.name] = (byName[e.name] ?? 0) + e.dur
    }
  }
  out.mainBreakdownMs = Object.fromEntries(Object.entries(byName).map(([k, v]) => [k, pct(v / 1000)]))
  return out
}

const MB = 1048576
const hex = (v) => (typeof v === 'string' ? parseInt(v, 16) : Number(v ?? 0))

/**
 * Memory of the page's renderer process and of the GPU process from a Chrome memory dump.
 * `gpuAngleMB` is what the Metal driver holds for the GPU process (textures, buffers and the
 * compositor's surfaces); the engine's own texture count is reported separately by the harness.
 */
export function analyzeMemory(events) {
  const procName = new Map()
  for (const e of events) if (e.ph === 'M' && e.name === 'process_name') procName.set(e.pid, e.args?.name)
  const procs = new Map()
  for (const e of events) {
    if (e.ph !== 'v' || !e.args?.dumps) continue
    const entry = procs.get(e.pid) ?? { footprint: 0, allocators: {} }
    const totals = e.args.dumps.process_totals
    if (totals?.private_footprint_bytes) entry.footprint = hex(totals.private_footprint_bytes)
    for (const [name, a] of Object.entries(e.args.dumps.allocators ?? {})) {
      const size = hex(a.attrs?.effective_size?.value ?? a.attrs?.size?.value)
      if (size) entry.allocators[name] = size
    }
    procs.set(e.pid, entry)
  }
  const named = (type) => [...procs.entries()].filter(([pid]) => procName.get(pid) === type).map(([, v]) => v)
  const renderer = named('Renderer').sort((a, b) => b.footprint - a.footprint)[0]
  const gpu = named('GPU Process')[0]
  const mb = (proc, key) => (proc ? Math.round(((proc.allocators[key] ?? 0) / MB) * 10) / 10 : null)
  const foot = (proc) => (proc ? Math.round((proc.footprint / MB) * 10) / 10 : null)
  return {
    rendererFootprintMB: foot(renderer),
    rendererV8MB: mb(renderer, 'v8'),
    rendererCanvasMB: mb(renderer, 'canvas'),
    rendererGpuBuffersMB: mb(renderer, 'gpu'),
    rendererMallocMB: mb(renderer, 'malloc'),
    gpuFootprintMB: foot(gpu),
    gpuAngleMB: mb(gpu, 'gpu/angle'),
    gpuSharedImagesMB: mb(gpu, 'gpu/shared_images'),
    gpuIoSurfaceMB: mb(gpu, 'iosurface'),
  }
}
