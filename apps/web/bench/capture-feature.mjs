// Visual check for one feature: a saved world (seed + tick) opened in a production build of the app in
// headless Chrome with the GPU, the camera centred on a feature at close and overview zoom, one PNG each.
//
//   node apps/web/bench/capture-feature.mjs --seed 42 --tick 18000 --feature building:market --out <dir>
//   node apps/web/bench/capture-feature.mjs --seed 42 --tick 18000 --list          # what the frame holds
//
// Features: building:<kind> (or a bare kind such as market, gate, watchtower), caravan[:<cargo>], boat, field.
// Options: --index N (which candidate, default 0), --zooms close,overview (also mid), --tag name,
//   --dist apps/web/dist, --cache apps/web/bench/.cache, --wasm apps/web/src/wasm/sim-core,
//   --limit 110 (seconds for the browser part), --gen-limit 900 (seconds to simulate a missing save),
//   --wait 2500 (ms after the first frame), --pause 1 (freeze the sim so moving things stay put), --port.
//
// Output: <out>/<tag>-<feature>-<zoom>.png, plus <...>-close-crop.png (the centre at 2x). The last line of
// stdout is JSON with the tile, the candidate count and the files.
// Hard limits: the browser is killed after --limit seconds whatever happens, and a simulation runs in a
// child process killed after --gen-limit seconds. Chrome runs headless; nothing opens a window.
// Saves are cached in --cache; the first run for a new seed and tick is the slow one.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

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
const limitS = Number(opt('limit', '110'))
const genLimitS = Number(opt('gen-limit', '900'))
const waitMs = Number(opt('wait', '2500'))
const pauseFirst = opt('pause', '1') === '1'
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
  console.log(`simulating seed ${seed} to tick ${tick} (cached afterwards in ${cache})`)
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
console.log(
  `feature ${feature} #${target.index} of ${target.candidates} at tile ${target.x},${target.y} (${target.name}, tick ${frame.tick})`,
)

if (!existsSync(path.join(dist, 'index.html'))) fail(`no build at ${dist}; run pnpm run build in apps/web`)

// 3. The browser: the same seeding and camera steering the bench uses.
const { startStaticServer } = await import(pathToFileURL(path.join(here, 'static-server.mjs')).href)
const { launchChrome, sleep } = await import(pathToFileURL(path.join(here, 'cdp.mjs')).href)
mkdirSync(out, { recursive: true })
const ZOOMS = { overview: 'fit', mid: 1, close: 3 }

let chromeRef = null
let serverRef = null
const watchdog = setTimeout(async () => {
  console.error('capture-feature: time limit reached, killing Chrome')
  try {
    await chromeRef?.kill()
  } catch {
    /* best effort */
  }
  serverRef?.close()
  process.exit(3)
}, limitS * 1000)

const server = await startStaticServer({ dist, cache, port: 0 })
serverRef = server
const chrome = await launchChrome({ port, width, height, dpr: 1, headless: true })
chromeRef = chrome
const { page } = chrome
const cmd = (c) => page.evaluate(`window.__thbBench.command(${JSON.stringify(c)})`)
const cam = () => page.evaluate('window.__thbBench.camera()')
const info = () => page.evaluate('window.__thbBench.info()')

async function settle() {
  let last = null
  for (let i = 0; i < 60; i++) {
    await sleep(100)
    const c = await cam()
    if (last && c.zoom === last.zoom && c.x === last.x && c.y === last.y) return c
    last = c
  }
  return last
}

const shots = []
let exitCode = 0
try {
  await page.send('Page.enable')
  await page.send('Runtime.enable')
  await page.send('Page.navigate', { url: `${server.origin}/__bench/seed.html?world=${name}` })
  for (let i = 0; i < 200; i++) {
    const done = await page.evaluate('window.__seeded === true || window.__seedError || false').catch(() => false)
    if (done === true) break
    if (typeof done === 'string') throw new Error(`seeding failed: ${done}`)
    await sleep(100)
  }
  await page.send('Page.navigate', { url: `${server.origin}/?bench=1` })
  for (let i = 0; i < 900; i++) {
    await sleep(100)
    if (await page.evaluate('!!window.__thbBench').catch(() => false)) break
  }
  for (let i = 0; i < 300; i++) {
    await sleep(100)
    if ((await page.evaluate('window.__benchFirstFrame ?? null').catch(() => null)) !== null) break
  }
  await sleep(waitMs)
  if (pauseFirst) {
    await page.evaluate('document.querySelector(\'[aria-label="Pause simulation"]\')?.click()')
    await sleep(400)
  }
  const pageInfo = await info()
  const tile = await page.evaluate('window.__thbBench.tile')
  // A moving feature (caravan) is placed where the page's sim is now, read from its frame data.
  const at = target.kind === 'caravan' ? caravanAt(target.entity, pageInfo.tick) : { x: target.x, y: target.y }
  const tx = Math.round(at.x)
  const ty = Math.round(at.y)
  console.log(`page tick ${pageInfo.tick}, people ${pageInfo.people}, centring on ${tx},${ty}`)

  for (const zoomName of zooms) {
    await cmd({ kind: 'fit' })
    await settle()
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
    await settle()
    await sleep(900)
    const shot = await page.send('Page.captureScreenshot', { format: 'png' })
    const file = path.join(out, `${tag}-${target.name}-${zoomName}.png`)
    writeFileSync(file, Buffer.from(shot.data, 'base64'))
    shots.push(file)
    if (zoomName === 'close') {
      const half = clipSize / 2
      const crop = await page.send('Page.captureScreenshot', {
        format: 'png',
        clip: { x: width / 2 - half, y: height / 2 - half, width: clipSize, height: clipSize, scale: 2 },
      })
      const cropFile = path.join(out, `${tag}-${target.name}-close-crop.png`)
      writeFileSync(cropFile, Buffer.from(crop.data, 'base64'))
      shots.push(cropFile)
    }
    console.log(`shot ${zoomName} zoom ${(await cam()).zoom.toFixed(2)} -> ${path.basename(shots.at(-1))}`)
  }
} catch (error) {
  console.error('capture-feature failed:', error.message)
  exitCode = 2
} finally {
  clearTimeout(watchdog)
  try {
    await chrome.kill()
  } finally {
    server.close()
  }
}
console.log(JSON.stringify({ feature, tile: { x: target.x, y: target.y }, candidates: target.candidates, tick, shots }))
process.exit(exitCode)
