// Main-thread smoothness at each speed: what a player feels when they fast-forward a world.
//
//   node bench/speeds.mjs --dist dist --fixture standard --speeds 1,5,20,100,5000 [--window 10000] [--profile out-dir]
//
// Opens one production build on a saved world (see gen-world.mjs and gen-save.mjs; any `<name>.bin` + `<name>.json`
// in the cache is a fixture), fits the whole world in view, then for each speed presses the time control's
// faster key until the bar shows it, waits, and measures a window:
//
//   fps        animation frames the page got a second (the map draws one per animation frame)
//   gap p99    the 99th percentile gap between animation frames, ms; a hitch a player sees is a big gap
//   >50 ms     animation-frame gaps over 50 ms in the window (stutters)
//   busy %     main-thread wall time in tasks (Performance.getMetrics TaskDuration)
//   long       long tasks (> 50 ms) and their total ms
//   achieved   the speed the world really ran at: ticks advanced / window, in multiples of 1x
//   heap, DOM  JS heap after the window and DOM nodes
//
// `--profile <dir>` also writes a CPU profile of each window (summarize with profile-summary.mjs).

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchChrome, sleep } from './cdp.mjs'
import { startStaticServer } from './static-server.mjs'
import { PAGE_INIT } from './page-init.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i < 0 ? fallback : (argv[i + 1] ?? fallback)
}
const dist = path.resolve(opt('dist', path.join(here, '..', 'dist')))
const cache = path.resolve(opt('cache', path.join(here, '.cache')))
const fixture = opt('fixture', 'standard')
const speeds = String(opt('speeds', '1,5,20,100,5000')).split(',').map(Number)
const windowMs = Number(opt('window', 10000))
const warmupMs = Number(opt('warmup', 4000))
const profileDir = opt('profile', null)
const label = opt('label', path.basename(dist))
const cpuThrottle = Number(opt('cpu-throttle', 1))

// The steps the faster key walks through (speedSteps.ts), from 1x.
const STEPS = [1, 2, 5, 10, 20, 50, 100, 500, 5000]
const BASE_TICK_MS = 120

const FRAME_WATCH = `(() => {
  window.__lag = { gaps: [], last: 0, long: [] }
  const loop = (t) => {
    const s = window.__lag
    if (s.last) s.gaps.push(t - s.last)
    s.last = t
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__lag.long.push(e.duration)
    }).observe({ type: 'longtask', buffered: false })
  } catch {}
})()`

const metricsOf = (res) => Object.fromEntries(res.metrics.map((m) => [m.name, m.value]))

async function main() {
  const server = await startStaticServer({ dist, cache })
  const port = 9400 + Math.floor(Math.random() * 400)
  const chrome = await launchChrome({ port, width: 1280, height: 800, dpr: 1, cpuThrottle })
  const { page } = chrome
  const rows = []
  try {
    await page.send('Page.enable')
    await page.send('Runtime.enable')
    await page.send('Performance.enable', { timeDomain: 'timeTicks' })
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE_INIT })
    await page.send('Page.navigate', { url: `${server.origin}/__bench/seed.html?world=${fixture}` })
    for (let i = 0; i < 600; i++) {
      const done = await page
        .evaluate('window.__seeded === true || window.__seedError || false')
        .catch(() => false)
      if (done === true) break
      if (typeof done === 'string') throw new Error(`seeding failed: ${done}`)
      await sleep(100)
    }
    await page.send('Page.navigate', { url: `${server.origin}/?bench=1` })
    let first = null
    for (let i = 0; i < 1200 && first === null; i++) {
      await sleep(100)
      first = await page.evaluate('window.__benchFirstFrame ?? null').catch(() => null)
    }
    if (first === null) throw new Error('the map never drew its first frame')
    for (let i = 0; i < 100; i++) {
      if (await page.evaluate('!!window.__thbBench').catch(() => false)) break
      await sleep(100)
    }
    await sleep(1500)
    await page.evaluate(`window.__thbBench.command({ kind: 'fit' })`)
    await sleep(1500)
    await page.evaluate(FRAME_WATCH)
    const tick = () => page.evaluate('window.__thbBench.info().tick')
    let at = 1
    for (const speed of speeds) {
      // Press the faster key until the time control is on the speed asked for.
      const target = STEPS.indexOf(speed)
      if (target < 0) throw new Error(`speed ${speed} is not a step`)
      while (STEPS.indexOf(at) < target) {
        await page.send('Input.dispatchKeyEvent', {
          type: 'keyDown',
          key: '.',
          code: 'Period',
          text: '.',
          windowsVirtualKeyCode: 190,
        })
        await page.send('Input.dispatchKeyEvent', {
          type: 'keyUp',
          key: '.',
          code: 'Period',
          windowsVirtualKeyCode: 190,
        })
        at = STEPS[STEPS.indexOf(at) + 1]
        await sleep(400)
      }
      await sleep(warmupMs)
      if (profileDir) {
        await page.send('Profiler.enable')
        await page.send('Profiler.setSamplingInterval', { interval: 500 })
        await page.send('Profiler.start')
      }
      await page.evaluate(
        `(() => { window.__lag.gaps = []; window.__lag.long = []; window.__thbCf?.registry?.reset?.() })()`,
      )
      const m0 = metricsOf(await page.send('Performance.getMetrics'))
      const k0 = await tick()
      const t0 = Date.now()
      await sleep(windowMs)
      const k1 = await tick()
      const wall = Date.now() - t0
      const m1 = metricsOf(await page.send('Performance.getMetrics'))
      const lag = await page.evaluate('({ gaps: window.__lag.gaps, long: window.__lag.long })')
      // Per-driver ms of the map's layer drivers over the window (CfRegistry.stats), the five costliest.
      const drivers = await page
        .evaluate(
          `(() => { const s = window.__thbCf?.registry?.stats?.(); if (!s) return null; return Object.entries(s).filter(([k, v]) => k.endsWith('Ms') && typeof v === 'number').sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => k.slice(0, -2) + '=' + Math.round(v)).join(' ') + ' all=' + Math.round(s.ms) })()`,
        )
        .catch(() => null)
      if (profileDir) {
        const { profile } = await page.send('Profiler.stop')
        mkdirSync(profileDir, { recursive: true })
        writeFileSync(
          path.join(profileDir, `${label}-${fixture}-${speed}x.cpuprofile`),
          JSON.stringify(profile),
        )
      }
      const gaps = [...lag.gaps].sort((a, b) => a - b)
      const q = (p) => (gaps.length ? gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * p))] : 0)
      const counters = await page.send('Memory.getDOMCounters').catch(() => null)
      const row = {
        label,
        fixture,
        speed,
        fps: +((gaps.length / wall) * 1000).toFixed(1),
        gapP50: +q(0.5).toFixed(1),
        gapP99: +q(0.99).toFixed(1),
        gapMax: +(gaps.at(-1) ?? 0).toFixed(0),
        gaps50: gaps.filter((g) => g > 50).length,
        busyPct: +((((m1.TaskDuration - m0.TaskDuration) * 1000) / wall) * 100).toFixed(1),
        scriptMs: Math.round((m1.ScriptDuration - m0.ScriptDuration) * 1000),
        long: lag.long.length,
        longMs: Math.round(lag.long.reduce((a, b) => a + b, 0)),
        achieved: +((((k1 - k0) / wall) * 1000 * BASE_TICK_MS) / 1000).toFixed(1),
        tick: k1,
        heapMB: +(m1.JSHeapUsedSize / 1048576).toFixed(0),
        dom: counters?.nodes ?? null,
        drivers,
      }
      rows.push(row)
      console.log(JSON.stringify(row))
    }
  } finally {
    await chrome.kill()
    server.close()
  }
  const out = opt('out', null)
  if (out) writeFileSync(out, JSON.stringify(rows, null, 2))
  const cols = [
    'speed',
    'fps',
    'gapP50',
    'gapP99',
    'gapMax',
    'gaps50',
    'busyPct',
    'long',
    'longMs',
    'achieved',
    'heapMB',
    'dom',
  ]
  console.log(`\n| ${cols.join(' | ')} |\n|${cols.map(() => '---').join('|')}|`)
  for (const r of rows) console.log(`| ${cols.map((c) => r[c]).join(' | ')} |`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
