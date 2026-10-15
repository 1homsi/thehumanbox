// Touch and narrow viewport regression checks for a production build.
//
//   pnpm build
//   node bench/mobile.mjs --shots /path/to/shots/MOB-38
//   node bench/mobile.mjs --strict-targets

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchChrome, sleep } from './cdp.mjs'
import { startStaticServer } from './static-server.mjs'
import { generate } from './gen-world.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const web = path.resolve(here, '..')
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i < 0 ? fallback : (process.argv[i + 1] ?? true)
}
const dist = path.resolve(arg('build', path.join(web, 'dist')))
const fixture = String(arg('fixture', 'standard'))
const shotsDir = arg('shots', null)
const strictTargets = process.argv.includes('--strict-targets')
const viewports = String(arg('viewports', '360x740,390x844,844x390,768x1024,1280x800'))
  .split(',')
  .map((size) => size.split('x').map(Number))
const dprFor = (width) => (width < 600 ? 3 : width < 1100 ? 2 : 1)
const cache = path.join(here, '.cache')
const wasmDir = path.join(web, 'src/wasm/sim-core')
const failures = []
const targetViolations = []

async function waitFor(page, expression, description, timeoutMs = 90_000) {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    if (await page.evaluate(expression).catch(() => false)) return
    await sleep(100)
  }
  throw new Error(`timed out waiting for ${description}`)
}

async function touch(page, type, points) {
  await page.send('Input.dispatchTouchEvent', { type, touchPoints: points })
}

async function drag(page, x1, y1, x2, y2, steps = 8) {
  await touch(page, 'touchStart', [{ x: x1, y: y1 }])
  for (let i = 1; i <= steps; i++) {
    await touch(page, 'touchMove', [{ x: x1 + ((x2 - x1) * i) / steps, y: y1 + ((y2 - y1) * i) / steps }])
  }
  await touch(page, 'touchEnd', [])
}

async function pinch(page, cx, cy, from, to, steps = 8) {
  const points = (distance) => [
    { id: 1, x: cx - distance / 2, y: cy },
    { id: 2, x: cx + distance / 2, y: cy },
  ]
  await touch(page, 'touchStart', points(from))
  for (let i = 1; i <= steps; i++) {
    await touch(page, 'touchMove', points(from + ((to - from) * i) / steps))
  }
  await touch(page, 'touchEnd', [])
}

async function checkViewport(origin, width, height, index) {
  const touchDevice = width < 1100
  const chrome = await launchChrome({
    port: 9600 + index,
    width,
    height,
    dpr: dprFor(width),
  })
  const { page } = chrome
  const label = `${width}x${height}`
  try {
    await page.send('Page.enable')
    await page.send('Runtime.enable')
    await page.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: dprFor(width),
      mobile: touchDevice,
      screenWidth: width,
      screenHeight: height,
      screenOrientation: {
        type: width > height ? 'landscapePrimary' : 'portraitPrimary',
        angle: width > height ? 90 : 0,
      },
    })
    if (touchDevice) {
      await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 })
    }
    await page.send('Page.navigate', { url: `${origin}/__bench/seed.html?world=${fixture}` })
    await waitFor(page, 'window.__seeded === true', 'seeded world')
    await page.send('Page.navigate', { url: `${origin}/?bench=1` })
    await waitFor(
      page,
      '!!window.__thbBench && !!document.querySelector("[aria-label=\\"Interactive world map\\"]")',
      'world map',
    )
    await sleep(1500)

    const layout = await page.evaluate(`(() => {
      const visible = (el) => {
        const r = el.getBoundingClientRect()
        const s = getComputedStyle(el)
        return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0
      }
      const targets = [...document.querySelectorAll('button,a,[role="button"],input,select,textarea')]
        .filter(visible)
        .map((el) => {
          const r = el.getBoundingClientRect()
          const label = el.getAttribute('aria-label') || el.textContent?.trim().replace(/\\s+/g, ' ').slice(0, 50) || el.tagName
          return { label, width: Math.round(r.width), height: Math.round(r.height) }
        })
      const modals = [...document.querySelectorAll('[role="dialog"],.thb-modal')].filter(visible).map((el) => {
        const r = el.getBoundingClientRect()
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }
      })
      return { innerWidth, scrollWidth: document.documentElement.scrollWidth, targets, modals }
    })()`)
    if (layout.scrollWidth !== layout.innerWidth)
      throw new Error(`horizontal overflow at ${label}: ${layout.scrollWidth}px > ${layout.innerWidth}px`)
    for (const target of layout.targets) {
      if (touchDevice && (target.width < 44 || target.height < 44))
        targetViolations.push({ viewport: label, ...target })
    }
    for (const modal of layout.modals) {
      if (modal.left < 0 || modal.top < 0 || modal.right > width + 1 || modal.bottom > height + 1)
        throw new Error(`modal exceeds ${label} viewport: ${JSON.stringify(modal)}`)
    }

    if (shotsDir) {
      mkdirSync(shotsDir, { recursive: true })
      const shot = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
      writeFileSync(path.join(shotsDir, `${label}.png`), Buffer.from(shot.data, 'base64'))
    }

    if (label === '390x844') {
      const cx = width / 2
      const cy = Math.round(height * 0.45)
      // A fit camera has no pan range on the compact standard fixture. Zoom in first.
      await page.evaluate('window.__thbBench.command({kind:"zoom", factor:3})')
      await sleep(300)
      const beforePan = await page.evaluate('window.__thbBench.camera()')
      await drag(page, cx, cy, cx + 45, cy + 22)
      await sleep(300)
      const afterPan = await page.evaluate('window.__thbBench.camera()')
      if (Math.abs(afterPan.x - beforePan.x) + Math.abs(afterPan.y - beforePan.y) < 1)
        throw new Error(
          `one-finger touch pan did not move the camera (${JSON.stringify({ beforePan, afterPan })})`,
        )

      await pinch(page, cx, cy, 60, 110)
      await sleep(300)
      const afterPinch = await page.evaluate('window.__thbBench.camera()')
      if (Math.abs(afterPinch.zoom - afterPan.zoom) < 0.01)
        throw new Error('two-finger touch pinch did not change zoom')

      const info = await page.evaluate('window.__thbBench.info()')
      const meta = await (await fetch(`${origin}/__bench/${fixture}.json`)).json()
      const focus = meta.focus
      await page.evaluate('window.__thbBench.command({kind:"fit"})')
      await sleep(700)
      const camera = await page.evaluate('window.__thbBench.camera()')
      const tile = await page.evaluate('window.__thbBench.tile')
      const rect = await page.evaluate(`(() => {
        const r = document.querySelector('[aria-label="Interactive world map"]').getBoundingClientRect()
        return { left: r.left, top: r.top, width: r.width, height: r.height }
      })()`)
      const px = Math.round(
        rect.left + rect.width / 2 + ((focus.x - info.originX + 0.5) * tile - camera.x) * camera.zoom,
      )
      const py = Math.round(
        rect.top + rect.height / 2 + ((focus.y - info.originY + 0.5) * tile - camera.y) * camera.zoom,
      )
      await touch(page, 'touchStart', [{ id: 1, x: px, y: py }])
      await touch(page, 'touchEnd', [])
      await sleep(600)
      const selected = await page.evaluate('!!document.querySelector(".panel-right.open .org-detail")')
      if (!selected) throw new Error(`tap at seeded focus (${px},${py}) did not select a person`)
    }

    if (touchDevice) {
      // Exercise an actual modal even before the phone menu exposes its opener.
      await page.evaluate('document.querySelector("[data-tour=stats-btn]")?.click()')
      await waitFor(page, '!!document.querySelector(".thb-modal")', 'stats modal')
      await sleep(150)
      const modal = await page.evaluate(`(() => {
        const el = document.querySelector('.thb-modal')
        const r = el.getBoundingClientRect()
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
      })()`)
      if (modal.left < 0 || modal.top < 0 || modal.right > width + 1 || modal.bottom > height + 1)
        throw new Error(`stats modal exceeds ${label} viewport: ${JSON.stringify(modal)}`)
      await page.evaluate('document.querySelector(".thb-modal [aria-label=Close]")?.click()')
    }
    console.log(
      `PASS ${label}: no overflow; ${layout.targets.length} visible controls; ${touchDevice ? 'Stats modal fits' : `${layout.modals.length} visible modals`}`,
    )
  } catch (error) {
    failures.push(`${label}: ${error?.message ?? error}`)
    console.error(`FAIL ${label}: ${error?.message ?? error}`)
  } finally {
    await chrome.kill()
  }
}

async function main() {
  await generate({ cache, wasmDir })
  const server = await startStaticServer({ dist, cache })
  try {
    for (const [index, [width, height]] of viewports.entries())
      await checkViewport(server.origin, width, height, index)
  } finally {
    server.close()
  }
  if (strictTargets && targetViolations.length)
    failures.push(
      `${targetViolations.length} visible touch controls are smaller than 44x44; first: ${JSON.stringify(targetViolations[0])}`,
    )
  if (targetViolations.length)
    console.warn(
      `TARGETS ${targetViolations.length} below 44x44${strictTargets ? ' (strict failure)' : ' (informational; pass --strict-targets to fail)'}`,
    )
  if (failures.length) {
    console.error(failures.map((failure) => `- ${failure}`).join('\n'))
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
