// World view benchmark: drives a production build in headless Google Chrome with the GPU, over CDP.
//
//   node bench/run.mjs --builds main=dist --runs 3
//   node bench/run.mjs --builds old=/path/to/old/dist,main=dist --runs 3     (interleaved, same conditions)
//
// Options (all optional)
//   --builds a=dir,b=dir  production builds to measure, label=dist directory (build with `pnpm build`).
//                       Several builds are measured one scenario after the other, so a slow machine
//                       affects them alike. Default: main=./dist
//   --out <dir>         results go to <dir>/<label>/results.json (default bench/results)
//   --runs <n>          repetitions of every scenario (default 3); the report takes medians
//   --fixtures a,b      standard,crowd (default both): seed 42 at tick 9000, and with 3,000 more people
//   --zooms a,b         overview,mid,close (default all): fit, zoom 1, zoom 3
//   --modes a,b         paused,playing (default both)
//   --passes a,b        metrics,trace,memory (default all). `metrics` reads the browser's own counters and
//                       adds nothing to the page; `trace` records a Chrome trace for frames
//                       delivered, GPU process time, GC pauses and long tasks; `memory` takes a Chrome
//                       memory dump (GPU process, renderer process, canvas and V8 heap).
//   --window <ms>       measured window (default 8000); --warmup <ms> before it (default 3000)
//   --dpr <n>           device pixel ratio (default 1); --size 1280x800
//   --profile           also write a CPU profile of each metrics scenario next to the results
//   --shots             save a screenshot of every scenario
//   --alloc-profile     sample every allocation in the window (what makes garbage), written as .heapprofile
//   --eval <js>         evaluate an expression in the page after the window, stored as result.eval
//   --gl-log           record live WebGL textures by size and texture upload sizes (metrics pass)
//   --headed            show the Chrome window (the default is headless)
//
// Every scenario starts a fresh Chrome (own temporary profile, own GPU process), so nothing is
// shared between runs. Chrome is killed when the scenario ends.

import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { loadavg } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchChrome, sleep } from './cdp.mjs'
import { startStaticServer } from './static-server.mjs'
import { generate } from './gen-world.mjs'
import { analyzeMemory, analyzeTrace, TRACE_CATEGORIES } from './trace.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  if (i < 0) return fallback
  const next = argv[i + 1]
  return next === undefined || next.startsWith('--') ? true : next
}
const list = (name, all) => {
  const v = opt(name, null)
  return v === null || v === true ? all : String(v).split(',')
}

const cache = path.resolve(opt('cache', path.join(here, '.cache')))
const builds = String(opt('builds', `main=${path.join(here, '..', 'dist')}`))
  .split(',')
  .map((entry) => {
    const eq = entry.indexOf('=')
    return { label: entry.slice(0, eq), dist: path.resolve(entry.slice(eq + 1)) }
  })
const outRoot = path.resolve(opt('out', path.join(here, 'results')))
const runs = Number(opt('runs', 3))
const fixtures = list('fixtures', ['standard', 'crowd'])
const zooms = list('zooms', ['overview', 'mid', 'close'])
const modes = list('modes', ['paused', 'playing'])
const passes = list('passes', ['metrics', 'trace', 'memory'])
const windowMs = Number(opt('window', 8000))
const warmupMs = Number(opt('warmup', 3000))
const dpr = Number(opt('dpr', 1))
const [width, height] = String(opt('size', '1280x800')).split('x').map(Number)
const wantProfile = opt('profile', false) === true
const wantShots = opt('shots', false) === true
const headed = opt('headed', false) === true
const wantGl = opt('gl-log', false) === true
const wantAlloc = opt('alloc-profile', false) === true
const evalExpr = opt('eval', null)

/** Zoom of each named view. `fit` is the opening view that shows the whole world. */
const ZOOMS = { overview: 'fit', mid: 1, close: 3 }

/** Runs in every document before the app: long tasks, and the moment the startup cover comes off. */
const INIT_SCRIPT = `(() => {
  window.__benchLong = []
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__benchLong.push([e.startTime, e.duration])
    }).observe({ type: 'longtask', buffered: true })
  } catch {}
  const watch = () => {
    const mo = new MutationObserver(() => {
      const cover = document.querySelector('.map2d-world > div')
      if (cover && cover.style.opacity === '0' && window.__benchFirstFrame === undefined) {
        window.__benchFirstFrame = performance.now()
        mo.disconnect()
      }
    })
    mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['style'] })
  }
  if (document.documentElement) watch()
  else document.addEventListener('DOMContentLoaded', watch)
})()`

/**
 * `--gl-log`: remembers every live WebGL texture and the texture uploads, so a run can say which
 * sizes the GPU memory goes to and how much is uploaded per second. Slows the page down a little.
 */
const GL_LOG = `(() => {
  const proto = WebGL2RenderingContext.prototype
  const bound = {}
  const live = new Map()
  const stats = { uploads: 0, uploadBytes: 0, uploadsByFrameSize: {} }
  window.__benchGl = stats
  const bytesFor = (w, h) => w * h * 4
  const dims = (a) => {
    // texImage2D(target, level, internal, w, h, border, format, type, data) or (..., format, type, source)
    if (typeof a[3] === 'number' && typeof a[4] === 'number' && a.length >= 8) return [a[3], a[4]]
    const src = a[a.length - 1]
    return [src && (src.videoWidth || src.width) || 0, src && (src.videoHeight || src.height) || 0]
  }
  const wrap = (name, fn) => {
    const orig = proto[name]
    proto[name] = function (...args) {
      fn.call(this, args)
      return orig.apply(this, args)
    }
  }
  wrap('bindTexture', ([target, tex]) => { bound[target] = tex })
  wrap('texImage2D', (a) => {
    if (a[1] !== 0) return
    const [w, h] = dims(a)
    const tex = bound[a[0]]
    if (tex) live.set(tex, { w, h })
    stats.uploads++
    stats.uploadBytes += bytesFor(w, h)
  })
  wrap('texStorage2D', (a) => {
    const tex = bound[a[0]]
    if (tex) live.set(tex, { w: a[3], h: a[4], levels: a[1] })
  })
  wrap('texSubImage2D', (a) => {
    const [w, h] = a.length >= 9 ? [a[4], a[5]] : [a[a.length - 1].width, a[a.length - 1].height]
    stats.uploads++
    stats.uploadBytes += bytesFor(w, h)
    const key = w + 'x' + h
    stats.uploadsByFrameSize[key] = (stats.uploadsByFrameSize[key] || 0) + 1
  })
  wrap('deleteTexture', ([tex]) => { live.delete(tex) })
  window.__benchGlSummary = () => {
    const bySize = {}
    let bytes = 0
    for (const t of live.values()) {
      const key = t.w + 'x' + t.h
      const b = bytesFor(t.w, t.h)
      bySize[key] = bySize[key] || { count: 0, bytes: 0 }
      bySize[key].count++
      bySize[key].bytes += b
      bytes += b
    }
    return { liveTextures: live.size, liveBytes: bytes, bySize, uploads: stats.uploads, uploadBytes: stats.uploadBytes, subUploadSizes: stats.uploadsByFrameSize }
  }
})()`

const metricsOf = (res) => Object.fromEntries(res.metrics.map((m) => [m.name, m.value]))

async function processCpu(browser) {
  const { processInfo } = await browser.send('SystemInfo.getProcessInfo')
  const out = { renderer: 0, gpu: 0, browser: 0 }
  for (const p of processInfo) {
    if (p.type === 'renderer') out.renderer += p.cpuTime
    else if (p.type === 'GPU' || p.type === 'gpu') out.gpu += p.cpuTime
    else if (p.type === 'browser') out.browser += p.cpuTime
  }
  return out
}

/** Reads counters the app and engine keep, in the page. Everything is optional: the old build has no engine. */
const PAGE_STATS = `(() => {
  const cf = window.__thbCf
  const engine = cf && cf.engine
  const stats = engine && engine.stats
  const r = stats && stats.render
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  return {
    now: performance.now(),
    long: window.__benchLong.length,
    longMs: window.__benchLong.reduce((a, e) => a + e[1], 0),
    engineFrames: stats ? num(stats.frame) : null,
    renderedFrames: r ? num(r.frames) : null,
    textureUploads: r ? num(r.textureUploads) : null,
    heapUsed: performance.memory ? performance.memory.usedJSHeapSize : null,
  }
})()`

const ENGINE_SNAPSHOT = `(() => {
  const engine = window.__thbCf && window.__thbCf.engine
  const stats = engine && engine.stats
  if (!stats) return null
  const r = stats.render || {}
  const pick = (o, keys) => Object.fromEntries(keys.filter((k) => typeof o[k] === 'number').map((k) => [k, o[k]]))
  return {
    engine: pick(stats, ['frame', 'frameIntervalMs', 'updateMs', 'systemsMs', 'scriptMs', 'physicsMs', 'renderMs', 'entityCount']),
    render: pick(r, ['drawCalls', 'instances', 'batches', 'spritesConsidered', 'spritesCulled', 'textureUploads', 'textureUploadBytes', 'textureCount', 'textureBytes', 'textCacheHits', 'textCacheMisses', 'textureCacheHits', 'textureCacheMisses', 'frames']),
  }
})()`

async function setView(page, zoom) {
  const cmd = (c) => page.evaluate(`window.__thbBench.command(${JSON.stringify(c)})`)
  const cam = () => page.evaluate('window.__thbBench.camera()')
  const settle = async () => {
    for (let i = 0; i < 40; i++) {
      await sleep(100)
      const a = await cam()
      await sleep(60)
      const b = await cam()
      if (a.zoom === b.zoom && a.x === b.x && a.y === b.y) return b
    }
    return cam()
  }
  await cmd({ kind: 'fit' })
  await settle()
  if (zoom === 'fit') return cam()
  return null
}

async function focusView(page, focus, zoom) {
  const info = await page.evaluate('window.__thbBench.info()')
  const tile = await page.evaluate('window.__thbBench.tile')
  const cmd = (c) => page.evaluate(`window.__thbBench.command(${JSON.stringify(c)})`)
  const cam = () => page.evaluate('window.__thbBench.camera()')
  await cmd({
    kind: 'focus',
    x: (focus.x - info.originX + 0.5) * tile,
    y: (focus.y - info.originY + 0.5) * tile,
  })
  await sleep(300)
  for (let i = 0; i < 14; i++) {
    const cur = await cam()
    if (Math.abs(cur.zoom - zoom) / zoom < 0.004) break
    await cmd({ kind: 'zoom', factor: zoom / cur.zoom })
    await sleep(250)
  }
  await sleep(300)
  return cam()
}

async function runScenario({ origin, label, outDir, fixture, meta, zoomName, mode, pass, port, runIndex }) {
  const chrome = await launchChrome({ port, width, height, dpr, headless: !headed })
  const { page, browser } = chrome
  const result = {
    label,
    fixture,
    zoom: zoomName,
    mode,
    pass,
    run: runIndex,
    viewport: `${width}x${height}@${dpr}`,
    chrome: chrome.version,
    loadAvg1m: Math.round(loadavg()[0] * 10) / 10,
  }
  try {
    await page.send('Page.enable')
    await page.send('Runtime.enable')
    await page.send('Performance.enable', { timeDomain: 'timeTicks' })
    await page.send('HeapProfiler.enable')
    await page.send('Page.addScriptToEvaluateOnNewDocument', {
      source: INIT_SCRIPT + ';\n' + (wantGl ? GL_LOG : ''),
    })

    // 1. Put the saved world where the app looks for it.
    await page.send('Page.navigate', { url: `${origin}/__bench/seed.html?world=${fixture}` })
    for (let i = 0; i < 200; i++) {
      const done = await page
        .evaluate('window.__seeded === true || window.__seedError || false')
        .catch(() => false)
      if (done === true) break
      if (typeof done === 'string') throw new Error(`seeding failed: ${done}`)
      await sleep(100)
    }

    // 2. Open the app on it and wait for the first drawn frame.
    await page.send('Page.navigate', { url: `${origin}/?bench=1` })
    let firstFrame = null
    for (let i = 0; i < 900 && firstFrame === null; i++) {
      await sleep(100)
      firstFrame = await page.evaluate('window.__benchFirstFrame ?? null').catch(() => null)
    }
    if (firstFrame === null) throw new Error('the map never drew its first frame')
    result.firstFrameMs = Math.round(firstFrame)
    for (let i = 0; i < 100; i++) {
      if (await page.evaluate('!!window.__thbBench').catch(() => false)) break
      await sleep(100)
    }

    // 3. Wait for the world to be there, then the view and the run mode.
    await sleep(1500)
    result.people = (await page.evaluate('window.__thbBench.info().people')) ?? null
    if (ZOOMS[zoomName] === 'fit') await setView(page, 'fit')
    else {
      await setView(page, 'fit')
      result.camera = await focusView(page, meta.focus, ZOOMS[zoomName])
    }
    if (mode === 'paused') {
      // The toolbar mounts a little after the map; the crowd world takes the longest.
      let paused = false
      for (let attempt = 0; attempt < 100 && !paused; attempt++) {
        await page.evaluate(`document.querySelector('[aria-label="Pause simulation"]')?.click()`)
        await sleep(200)
        paused = await page.evaluate(`!!document.querySelector('[aria-label="Resume simulation"]')`)
      }
      if (!paused) throw new Error('could not pause the simulation')
    }
    await sleep(warmupMs)
    result.camera = await page.evaluate('window.__thbBench.camera()')

    // 4. The measured window.
    const profileOn = wantProfile && pass === 'metrics'
    if (profileOn) {
      await page.send('Profiler.enable')
      await page.send('Profiler.setSamplingInterval', { interval: 200 })
      await page.send('Profiler.start')
    }
    const allocOn = wantAlloc && pass === 'metrics'
    if (allocOn)
      await page.send('HeapProfiler.startSampling', {
        samplingInterval: 8192,
        includeObjectsCollectedByMajorGC: true,
        includeObjectsCollectedByMinorGC: true,
      })
    const traceEvents = []
    if (pass === 'memory') {
      // A memory dump of every process: GPU textures and shared images, renderer heaps, canvas backing.
      browser.on('Tracing.dataCollected', (p) => traceEvents.push(...p.value))
      await browser.send('Tracing.start', {
        traceConfig: {
          recordMode: 'recordAsMuchAsPossible',
          includedCategories: ['-*', 'disabled-by-default-memory-infra'],
          memoryDumpConfig: { triggers: [] },
        },
      })
      await sleep(500)
      await browser.send(
        'Tracing.requestMemoryDump',
        { deterministic: true, levelOfDetail: 'detailed' },
        120_000,
      )
      await browser.send('Tracing.end')
      await new Promise((resolve) => {
        const off = browser.on('Tracing.tracingComplete', () => {
          off()
          resolve()
        })
        setTimeout(resolve, 60_000)
      })
      if (process.env.BENCH_DUMP_MEM) writeFileSync(process.env.BENCH_DUMP_MEM, JSON.stringify(traceEvents))
      Object.assign(result, analyzeMemory(traceEvents))
      return result
    }
    if (pass === 'trace') {
      browser.on('Tracing.dataCollected', (p) => traceEvents.push(...p.value))
      await browser.send('Tracing.start', {
        traceConfig: { recordMode: 'recordAsMuchAsPossible', includedCategories: TRACE_CATEGORIES },
      })
      await sleep(300)
    }
    await page.evaluate(`performance.mark('bench-start')`)
    const m0 = metricsOf(await page.send('Performance.getMetrics'))
    const p0 = await processCpu(browser)
    const s0 = await page.evaluate(PAGE_STATS)
    const t0 = Date.now()
    await sleep(windowMs)
    const elapsed = Date.now() - t0
    const s1 = await page.evaluate(PAGE_STATS)
    const p1 = await processCpu(browser)
    const m1 = metricsOf(await page.send('Performance.getMetrics'))
    await page.evaluate(`performance.mark('bench-end')`)

    const wall = (m1.Timestamp - m0.Timestamp) * 1000
    result.windowMs = Math.round(wall)
    const d = (k) => (m1[k] - m0[k]) * 1000
    if (pass === 'metrics') {
      result.mainBusyPct = (d('TaskDuration') / wall) * 100
      result.mainCpuPct = (d('ThreadTime') / wall) * 100
      result.scriptMs = d('ScriptDuration')
      result.layoutMs = d('LayoutDuration') + d('RecalcStyleDuration')
      result.rendererProcessCpuPct = (((p1.renderer - p0.renderer) * 1000) / elapsed) * 100
      result.gpuProcessCpuPct = (((p1.gpu - p0.gpu) * 1000) / elapsed) * 100
      result.browserProcessCpuPct = (((p1.browser - p0.browser) * 1000) / elapsed) * 100
      result.longTasks = s1.long - s0.long
      result.longTaskMs = s1.longMs - s0.longMs
      if (s0.renderedFrames !== null && s1.renderedFrames !== null) {
        result.engineFramesRendered = s1.renderedFrames - s0.renderedFrames
        result.engineFps = (result.engineFramesRendered / wall) * 1000
        result.jsMsPerEngineFrame = result.engineFramesRendered
          ? result.scriptMs / result.engineFramesRendered
          : null
        result.textureUploadsPerSec = ((s1.textureUploads - s0.textureUploads) / wall) * 1000
      }
      result.heapUsedStartMB = (s0.heapUsed ?? 0) / 1048576
      result.heapUsedEndMB = (s1.heapUsed ?? 0) / 1048576
      if (profileOn) {
        const { profile } = await page.send('Profiler.stop')
        mkdirSync(outDir, { recursive: true })
        writeFileSync(
          path.join(outDir, `${fixture}-${zoomName}-${mode}-run${runIndex}.cpuprofile`),
          JSON.stringify(profile),
        )
      }
      if (allocOn) {
        const { profile } = await page.send('HeapProfiler.stopSampling')
        mkdirSync(outDir, { recursive: true })
        writeFileSync(
          path.join(outDir, `${fixture}-${zoomName}-${mode}-run${runIndex}.heapprofile`),
          JSON.stringify(profile),
        )
      }
      // Memory after a full collection.
      await page.send('HeapProfiler.collectGarbage')
      await page.send('HeapProfiler.collectGarbage')
      const usage = await page.send('Runtime.getHeapUsage')
      result.heapAfterGcMB = usage.usedSize / 1048576
      result.heapTotalMB = usage.totalSize / 1048576
      const snapshot = await page.evaluate(ENGINE_SNAPSHOT)
      if (snapshot) {
        result.engine = snapshot.engine
        result.render = snapshot.render
        result.textureMB = (snapshot.render.textureBytes ?? 0) / 1048576
      }
      if (wantGl) result.glTextures = await page.evaluate('window.__benchGlSummary()')
      if (evalExpr) result.eval = await page.evaluate(evalExpr)
      const counters = await page.send('Memory.getDOMCounters').catch(() => null)
      if (counters) result.domNodes = counters.nodes
    } else {
      await browser.send('Tracing.end')
      await new Promise((resolve) => {
        const off = browser.on('Tracing.tracingComplete', () => {
          off()
          resolve()
        })
        setTimeout(resolve, 60_000)
      })
      if (process.env.BENCH_DUMP_TRACE)
        writeFileSync(process.env.BENCH_DUMP_TRACE, JSON.stringify(traceEvents))
      Object.assign(result, analyzeTrace(traceEvents))
    }
    if (wantShots && pass === 'metrics') {
      const shot = await page.send('Page.captureScreenshot', { format: 'png' })
      const dir = path.join(outDir, 'shots')
      mkdirSync(dir, { recursive: true })
      writeFileSync(
        path.join(dir, `${fixture}-${zoomName}-${mode}-run${runIndex}.png`),
        Buffer.from(shot.data, 'base64'),
      )
    }
  } catch (error) {
    result.error = String(error?.message ?? error)
  } finally {
    await chrome.kill()
  }
  return result
}

async function main() {
  for (const b of builds)
    if (!existsSync(path.join(b.dist, 'index.html')))
      throw new Error(`no build in ${b.dist}; run \`pnpm build\` first`)
  const wasmDir = path.resolve(here, '..', 'src', 'wasm', 'sim-core')
  await generate({ cache, wasmDir })
  for (const b of builds) {
    b.server = await startStaticServer({ dist: b.dist, cache })
    b.outDir = path.join(outRoot, b.label)
    b.results = []
    mkdirSync(b.outDir, { recursive: true })
    console.log(`${b.label}: serving ${b.dist} at ${b.server.origin}; results in ${b.outDir}`)
  }
  let port = 9400 + Math.floor(Math.random() * 400)
  const metas = {}
  for (const fixture of fixtures)
    metas[fixture] = JSON.parse(
      await (await fetch(`${builds[0].server.origin}/__bench/${fixture}.json`)).text(),
    )
  try {
    for (let runIndex = 1; runIndex <= runs; runIndex++) {
      for (const fixture of fixtures) {
        for (const zoomName of zooms) {
          for (const mode of modes) {
            for (const pass of passes) {
              for (const b of builds) {
                const t = Date.now()
                // A scenario that fails (a Chrome that did not start, a timeout on a loaded machine) is tried again.
                let result
                for (let attempt = 1; attempt <= 3; attempt++) {
                  result = await runScenario({
                    origin: b.server.origin,
                    label: b.label,
                    outDir: b.outDir,
                    fixture,
                    meta: metas[fixture],
                    zoomName,
                    mode,
                    pass,
                    port: port++,
                    runIndex,
                  })
                  if (!result.error) break
                  console.log(`retry ${b.label} ${fixture}/${zoomName}/${mode}/${pass}: ${result.error}`)
                }
                b.results.push(result)
                const tag = `${b.label} ${fixture}/${zoomName}/${mode}/${pass} run ${runIndex}`
                if (result.error) console.log(`FAIL ${tag}: ${result.error}`)
                else
                  console.log(
                    `ok   ${tag} (${((Date.now() - t) / 1000).toFixed(0)}s)` +
                      (result.mainBusyPct !== undefined ? ` busy ${result.mainBusyPct.toFixed(1)}%` : '') +
                      (result.fps !== undefined ? ` fps ${result.fps.toFixed(1)}` : '') +
                      (result.gpuAngleMB !== undefined ? ` gpu ${result.gpuAngleMB}MB` : ''),
                  )
                writeFileSync(path.join(b.outDir, 'results.json'), JSON.stringify(b.results, null, 2))
              }
            }
          }
        }
      }
    }
  } finally {
    for (const b of builds) b.server.close()
  }
  console.log(
    `done; summarize with: node bench/report.mjs ${builds.map((b) => path.relative(process.cwd(), b.outDir)).join(' ')}`,
  )
}

await main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
process.exit(process.exitCode ?? 0)
