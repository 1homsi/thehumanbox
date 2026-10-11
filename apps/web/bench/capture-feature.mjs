// Visual check for one feature: a saved world (seed + tick) opened in a production build of the app in
// headless Chrome with the GPU, the camera centred on a feature at close and overview zoom, one PNG each.
//
//   node apps/web/bench/capture-feature.mjs --seed 42 --tick 18000 --feature building:market --out <dir>
//   node apps/web/bench/capture-feature.mjs --seed 42 --tick 18000 --list          # what the frame holds
//
// Features: building:<kind> (or a bare kind such as market, gate, watchtower), caravan[:<cargo>], boat, ferry,
//   ship, train, rail, field, pier (a harbour's pier, or a ferry landing).
// Options: --index N (which candidate, default 0), --zooms close,overview (also mid), --tag name,
//   --dist apps/web/dist, --cache apps/web/bench/.cache, --wasm apps/web/src/wasm/sim-core,
//   --limit 240 (seconds for the whole browser part), --gen-limit 900 (seconds to simulate a missing save),
//   --wait 2500 (ms after the first frame), --pause 1 (freeze the sim so moving things stay put), --port,
//   --mark 1 (a magenta square on the map centre, where the target tile is, in the close shots).
//
// Output: <out>/<tag>-<feature>-<zoom>.png, plus <...>-close-crop.png (the centre at 2x). The last line of
// stdout is JSON with the tile, the candidate count and the files.
//
// Readiness: the page is ready when the map has drawn its first frame. That is the same signal the
// benchmark uses (the startup cover fades to opacity 0, see PAGE_INIT), not a fixed wait. Every wait has
// its own deadline and says what it was waiting for; every CDP call has a timeout.
// Hard limits: the whole browser part is killed after --limit seconds, and Chrome (with its helpers, in
// its own process group) is killed on every exit path of this script, including Ctrl-C and SIGTERM.
// A simulation runs in a child process killed after --gen-limit seconds. Nothing opens a window.
// Saves are cached in --cache; the first run for a new seed and tick is the slow one.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

const started = Date.now()
const log = (message) => console.error(`capture-feature [${((Date.now() - started) / 1000).toFixed(1)}s] ${message}`)

const here = path.dirname(fileURLToPath(import.meta.url))
const webDir = path.resolve(here, '..')
const args = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback
}
const has = (name) => args.includes(`--${name}`)

const seed = Number(opt('seed', '42'))
const tick = Number(opt('tick', '9000'))
const feature = opt('feature', 'building:market')
const index = Number(opt('index', '0'))
const out = path.resolve(opt('out', path.join(here, 'results', 'capture')))
const zooms = opt('zooms', 'close,overview').split(',').filter(Boolean)
const tag = opt('tag', `s${seed}-t${tick}`)
const dist = path.resolve(opt('dist', path.join(webDir, 'dist')))
const cache = path.resolve(opt('cache', path.join(here, '.cache')))
const wasmDir = path.resolve(opt('wasm', path.join(webDir, 'src', 'wasm', 'sim-core')))
const limitS = Number(opt('limit', '240'))
const genLimitS = Number(opt('gen-limit', '900'))
const waitMs = Number(opt('wait', '2500'))
const pauseFirst = opt('pause', '1') === '1'
const mark = opt('mark', '1') === '1'
// Puts a thin magenta square at the centre of the largest canvas (the map), where the target tile is,
// and returns that centre in window pixels. Added to this page only, for the capture.
const MARK_SCRIPT = `(() => {
  document.getElementById('thb-capture-mark')?.remove()
  const rects = [...document.querySelectorAll('canvas')]
    .map((c) => c.getBoundingClientRect())
    .filter((r) => r.width > 200 && r.height > 200)
    .sort((a, b) => b.width * b.height - a.width * a.height)
  const r = rects[0]
  if (!r) return null
  const x = r.left + r.width / 2
  const y = r.top + r.height / 2
  const el = document.createElement('div')
  el.id = 'thb-capture-mark'
  el.style.cssText = 'position:fixed;left:' + (x - 9) + 'px;top:' + (y - 9) + 'px;width:18px;height:18px;' +
    'border:2px solid #ff2bd6;box-sizing:border-box;pointer-events:none;z-index:2147483647'
  document.body.appendChild(el)
  return { x, y, w: r.width, h: r.height }
})()`
const width = 1280
const height = 800
const clipSize = 560
const port = Number(opt('port', String(9300 + Math.floor(Math.random() * 500))))

const fail = (message, code = 2) => {
  console.error(`capture-feature: ${message}`)
  process.exit(code)
}
if (!Number.isInteger(seed) || !Number.isInteger(tick) || tick < 0) fail('--seed and --tick must be whole numbers')
for (const z of zooms) if (!['close', 'mid', 'overview'].includes(z)) fail(`unknown zoom "${z}"`)

// 1. The save: simulate it once if the cache has no copy (in a child process with a hard limit).
const name = `s${seed}-t${tick}`
const savePaths = [`${name}.bin`, `${name}.json`, `${name}.frame.json`].map((f) => path.join(cache, f))
if (!savePaths.every((p) => existsSync(p))) {
  if (!existsSync(path.join(wasmDir, 'sim_core.js'))) {
    fail(`no wasm at ${wasmDir}; run scripts/build-wasm.sh first`)
  }
  log(`simulating seed ${seed} to tick ${tick} (cached afterwards in ${cache}), limit ${genLimitS} s`)
  const gen = spawnSync(
    process.execPath,
    [path.join(here, 'gen-save.mjs'), '--seed', String(seed), '--tick', String(tick), '--cache', cache, '--wasm', wasmDir],
    { stdio: 'inherit', timeout: genLimitS * 1000, killSignal: 'SIGKILL' },
  )
  if (gen.error || gen.status !== 0) fail(`simulating failed (${gen.error?.code ?? `exit ${gen.status}`})`)
}

// 2. The feature's tile, from the saved frame.
const { findFeature, summarize, caravanAt } = await import(pathToFileURL(path.join(here, 'find-feature.mjs')).href)
const frame = JSON.parse(readFileSync(savePaths[2], 'utf8'))
if (has('list')) {
  console.log(JSON.stringify(summarize(frame), null, 2))
  process.exit(0)
}
let target
try {
  target = findFeature(frame, feature, { index })
} catch (error) {
  fail(error.message)
}
log(`feature ${feature} #${target.index} of ${target.candidates} at tile ${target.x},${target.y} (${target.name}, tick ${frame.tick})`)

if (!existsSync(path.join(dist, 'index.html'))) fail(`no build at ${dist}; run pnpm run build in apps/web`)

// 3. The browser: the same seeding and camera steering the bench uses.
const { startStaticServer } = await import(pathToFileURL(path.join(here, 'static-server.mjs')).href)
const { launchChrome, sleep } = await import(pathToFileURL(path.join(here, 'cdp.mjs')).href)
const { PAGE_INIT } = await import(pathToFileURL(path.join(here, 'page-init.mjs')).href)
mkdirSync(out, { recursive: true })
const ZOOMS = { overview: 'fit', mid: 1, close: 3 }
const CALL_MS = 15_000 // one evaluate or one screenshot
const SHOT_MS = 30_000

let chrome = null
let server = null
let phase = 'starting'
let finished = false
// Chrome and the server are released exactly once, whichever way the script ends.
const release = () => {
  if (finished) return
  finished = true
  try {
    chrome?.killNow()
  } catch {
    /* already gone */
  }
  try {
    server?.close()
  } catch {
    /* already closed */
  }
}
const exitWith = (code) => {
  release()
  process.exit(code)
}
const watchdog = setTimeout(() => {
  log(`time limit of ${limitS} s reached while ${phase}; killing Chrome`)
  exitWith(3)
}, limitS * 1000)
process.once('SIGINT', () => exitWith(130))
process.once('SIGTERM', () => exitWith(143))

/** Polls `check` until it returns true or `ms` passes. Says what it waited for when it gives up. */
async function waitFor(label, check, ms) {
  const deadline = Date.now() + ms
  let lastError = null
  while (Date.now() < deadline) {
    try {
      if ((await check()) === true) return
    } catch (error) {
      lastError = error.message
    }
    await sleep(100)
  }
  throw new Error(`no ${label} after ${Math.round(ms / 1000)} s${lastError ? ` (last error: ${lastError})` : ''}`)
}

async function settle(page) {
  let last = null
  for (let i = 0; i < 60; i++) {
    await sleep(100)
    const c = await page.evaluate('window.__thbBench.camera()', CALL_MS)
    if (last && c.zoom === last.zoom && c.x === last.x && c.y === last.y) return c
    last = c
  }
  return last
}

const shots = []
let exitCode = 0
try {
  phase = 'starting Chrome'
  chrome = await launchChrome({ port, width, height, dpr: 1, headless: true })
  const { page } = chrome
  const cmd = (c) => page.evaluate(`window.__thbBench.command(${JSON.stringify(c)})`, CALL_MS)
  const cam = () => page.evaluate('window.__thbBench.camera()', CALL_MS)
  const info = () => page.evaluate('window.__thbBench.info()', CALL_MS)
  server = await startStaticServer({ dist, cache, port: 0 })

  await page.send('Page.enable', {}, CALL_MS)
  await page.send('Runtime.enable', {}, CALL_MS)
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE_INIT }, CALL_MS)

  phase = 'seeding the saved world'
  await page.send('Page.navigate', { url: `${server.origin}/__bench/seed.html?world=${name}` }, CALL_MS)
  await waitFor(
    'the saved world stored in the browser',
    async () => {
      const seeded = await page.evaluate('window.__seeded === true || (window.__seedError ? String(window.__seedError) : false)', CALL_MS)
      if (typeof seeded === 'string') throw new Error(`seeding failed: ${seeded}`)
      return seeded === true
    },
    30_000,
  )

  phase = 'starting the app'
  await page.send('Page.navigate', { url: `${server.origin}/?bench=1` }, CALL_MS)
  await waitFor('the bench hooks on the page', () => page.evaluate('!!window.__thbBench', CALL_MS), 60_000)
  phase = 'waiting for the first frame'
  await waitFor('first frame', () => page.evaluate('window.__benchFirstFrame != null', CALL_MS), 120_000)
  log('first frame drawn')
  await sleep(waitMs)
  if (pauseFirst) {
    await page.evaluate('document.querySelector(\'[aria-label="Pause simulation"]\')?.click()', CALL_MS)
    await sleep(400)
  }
  const pageInfo = await info()
  const tile = await page.evaluate('window.__thbBench.tile', CALL_MS)
  // A moving feature (caravan) is placed where the page's sim is now, read from its frame data.
  const at = target.kind === 'caravan' ? caravanAt(target.entity, pageInfo.tick) : { x: target.x, y: target.y }
  const tx = Math.round(at.x)
  const ty = Math.round(at.y)
  log(`page tick ${pageInfo.tick}, people ${pageInfo.people}, centring on ${tx},${ty}`)

  for (const zoomName of zooms) {
    let markSpot = null
    phase = `framing the ${zoomName} shot`
    await cmd({ kind: 'fit' })
    await settle(page)
    if (zoomName !== 'overview') {
      const z = ZOOMS[zoomName]
      await cmd({
        kind: 'focus',
        x: (tx - pageInfo.originX + 0.5) * tile,
        y: (ty - pageInfo.originY + 0.5) * tile,
      })
      await sleep(300)
      for (let i = 0; i < 14; i++) {
        const cur = await cam()
        if (Math.abs(cur.zoom - z) / z < 0.004) break
        await cmd({ kind: 'zoom', factor: z / cur.zoom })
        await sleep(250)
      }
    }
    await settle(page)
    await sleep(900)
    phase = `capturing the ${zoomName} shot`
    if (mark && zoomName !== 'overview') {
      // A capture-only crosshair at the map's centre, where the camera puts the target tile. It is a DOM
      // element added to this page only; the production build is untouched. The overview is centred on
      // the whole map, so it gets none.
      markSpot = await page.evaluate(MARK_SCRIPT, CALL_MS)
      if (markSpot) log(`crosshair on the map centre at ${Math.round(markSpot.x)},${Math.round(markSpot.y)}`)
      else log('no map canvas found for the crosshair')
    } else {
      await page.evaluate("document.getElementById('thb-capture-mark')?.remove()", CALL_MS)
    }
    const shot = await page.send('Page.captureScreenshot', { format: 'png' }, SHOT_MS)
    const file = path.join(out, `${tag}-${target.name}-${zoomName}.png`)
    writeFileSync(file, Buffer.from(shot.data, 'base64'))
    shots.push(file)
    if (zoomName === 'close') {
      // The crop is centred on the crosshair when there is one (the map is not the whole window).
      const half = clipSize / 2
      const cx = markSpot ? markSpot.x : width / 2
      const cy = markSpot ? markSpot.y : height / 2
      const crop = await page.send(
        'Page.captureScreenshot',
        {
          format: 'png',
          clip: { x: cx - half, y: cy - half, width: clipSize, height: clipSize, scale: 2 },
        },
        SHOT_MS,
      )
      const cropFile = path.join(out, `${tag}-${target.name}-close-crop.png`)
      writeFileSync(cropFile, Buffer.from(crop.data, 'base64'))
      shots.push(cropFile)
    }
    log(`shot ${zoomName} zoom ${(await cam()).zoom.toFixed(2)} -> ${path.basename(shots.at(-1))}`)
  }
} catch (error) {
  console.error(`capture-feature failed while ${phase}: ${error.message}`)
  exitCode = 2
} finally {
  clearTimeout(watchdog)
  release()
}
console.log(JSON.stringify({ feature, tile: { x: target.x, y: target.y }, candidates: target.candidates, tick, shots }))
process.exit(exitCode)
